/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as theia from '@theia/plugin';
import { ModelChangedEvent, DocumentsMain } from '../common/plugin-api-rpc';
import { Range as ARange } from '../common/plugin-api-rpc-model';
import { URI } from '@theia/core/shared/vscode-uri';
import { ok } from '../common/assert';
import { Range, Position, EndOfLine } from './types-impl';
import { PrefixSumComputer } from './prefix-sum-computer';
import { getWordAtText, ensureValidWordDefinition } from './word-helper';

const _modeId2WordDefinition = new Map<string, RegExp | null>();
export function setWordDefinitionFor(modeId: string, wordDefinition: RegExp | null): void {
    _modeId2WordDefinition.set(modeId, wordDefinition);
}
export function getWordDefinitionFor(modeId: string): RegExp {
    return _modeId2WordDefinition.get(modeId)!;
}

export class DocumentDataExt {

    private disposed = false;
    private dirty: boolean;
    private _document: theia.TextDocument;
    private textLines = new Array<theia.TextLine>();
    private lineStarts: PrefixSumComputer | undefined;

    constructor(private proxy: DocumentsMain, private uri: URI, private lines: string[], private eol: string,
        private languageId: string, private versionId: number, isDirty: boolean) {
        this.dirty = isDirty;
    }

    dispose(): void {
        ok(!this.disposed);
        this.dirty = false;
        this.disposed = true;
    }

    onEvents(e: ModelChangedEvent): void {
        if (e.eol && e.eol !== this.eol) {
            this.eol = e.eol;
            this.lineStarts = undefined;
        }

        // Update my lines
        const changes = e.changes;
        // tslint:disable-next-line:one-variable-per-declaration
        for (let i = 0, len = changes.length; i < len; i++) {
            const change = changes[i];
            this.acceptDeleteRange(change.range);
            this.acceptInsertText(new Position(change.range.startLineNumber, change.range.startColumn), change.text);
        }

        this.versionId = e.versionId;
    }
    acceptIsDirty(isDirty: boolean): void {
        ok(!this.disposed);
        this.dirty = isDirty;
    }
    acceptLanguageId(langId: string): void {
        ok(!this.disposed);
        this.languageId = langId;
    }
    get document(): theia.TextDocument {
        if (!this._document) {
            const that = this;
            this._document = {
                get uri(): theia.Uri { return that.uri; },
                get fileName(): string { return that.uri.fsPath; },
                get isUntitled(): boolean { return that.uri.scheme === 'untitled'; },
                get languageId(): string { return that.languageId; },
                get version(): number { return that.versionId; },
                get isClosed(): boolean { return that.disposed; },
                get isDirty(): boolean { return that.dirty; },
                save(): Promise<boolean> { return that.save(); },
                getText(range?): string { return range ? that.getTextInRange(range) : that.getText(); },
                get eol(): theia.EndOfLine { return that.eol === '\n' ? EndOfLine.LF : EndOfLine.CRLF; },
                get lineCount(): number { return that.lines.length; },
                lineAt(lineOrPos: number | theia.Position): theia.TextLine { return that.lineAt(lineOrPos); },
                offsetAt(pos): number { return that.offsetAt(pos); },
                positionAt(offset): theia.Position { return that.positionAt(offset); },
                validateRange(ran): theia.Range { return that.validateRange(ran); },
                validatePosition(pos): theia.Position { return that.validatePosition(pos); },
                getWordRangeAtPosition(pos, regexp?): theia.Range | undefined { return that.getWordRangeAtPosition(pos, regexp); }
            };
        }
        return Object.freeze(this._document);
    }

    private acceptInsertText(position: Position, insertText: string): void {
        if (insertText.length === 0) {
            // Nothing to insert
            return;
        }
        const insertLines = insertText.split(/\r\n|\r|\n/);
        if (insertLines.length === 1) {
            // Inserting text on one line
            this.setLineText(position.line - 1,
                this.lines[position.line - 1].substring(0, position.character - 1)
                + insertLines[0]
                + this.lines[position.line - 1].substring(position.character - 1)
            );
            return;
        }

        // Append overflowing text from first line to the end of text to insert
        insertLines[insertLines.length - 1] += this.lines[position.line - 1].substring(position.character - 1);

        // Delete overflowing text from first line and insert text on first line
        this.setLineText(position.line - 1,
            this.lines[position.line - 1].substring(0, position.character - 1)
            + insertLines[0]
        );

        // Insert new lines & store lengths
        const newLengths = new Uint32Array(insertLines.length - 1);
        for (let i = 1; i < insertLines.length; i++) {
            this.lines.splice(position.line + i - 1, 0, insertLines[i]);
            newLengths[i - 1] = insertLines[i].length + this.eol.length;
        }

        if (this.lineStarts) {
            // update prefix sum
            this.lineStarts.insertValues(position.line, newLengths);
        }
    }

    private acceptDeleteRange(range: ARange): void {

        if (range.startLineNumber === range.endLineNumber) {
            if (range.startColumn === range.endColumn) {
                // Nothing to delete
                return;
            }
            // Delete text on the affected line
            this.setLineText(range.startLineNumber - 1,
                this.lines[range.startLineNumber - 1].substring(0, range.startColumn - 1)
                + this.lines[range.startLineNumber - 1].substring(range.endColumn - 1)
            );
            return;
        }

        // Take remaining text on last line and append it to remaining text on first line
        this.setLineText(range.startLineNumber - 1,
            this.lines[range.startLineNumber - 1].substring(0, range.startColumn - 1)
            + this.lines[range.endLineNumber - 1].substring(range.endColumn - 1)
        );

        // Delete middle lines
        this.lines.splice(range.startLineNumber, range.endLineNumber - range.startLineNumber);
        if (this.lineStarts) {
            this.lineStarts.removeValues(range.startLineNumber, range.endLineNumber - range.startLineNumber);
        }
    }

    private setLineText(lineIndex: number, newValue: string): void {
        this.lines[lineIndex] = newValue;
        if (this.lineStarts) {
            this.lineStarts.changeValue(lineIndex, this.lines[lineIndex].length + this.eol.length);
        }
    }

    private save(): Promise<boolean> {
        if (this.disposed) {
            return Promise.reject(new Error('Document is closed'));
        }
        return this.proxy.$trySaveDocument(this.uri);
    }

    private getTextInRange(_range: theia.Range): string {
        const range = this.validateRange(_range);

        if (range.isEmpty) {
            return '';
        }

        if (range.isSingleLine) {
            return this.lines[range.start.line].substring(range.start.character, range.end.character);
        }

        const lineEnding = this.eol;
        const startLineIndex = range.start.line;
        const endLineIndex = range.end.line;
        const resultLines: string[] = [];

        resultLines.push(this.lines[startLineIndex].substring(range.start.character));
        for (let i = startLineIndex + 1; i < endLineIndex; i++) {
            resultLines.push(this.lines[i]);
        }
        resultLines.push(this.lines[endLineIndex].substring(0, range.end.character));

        return resultLines.join(lineEnding);
    }

    private validateRange(range: theia.Range): theia.Range {
        if (!(range instanceof Range)) {
            throw new Error('Invalid argument');
        }

        const start = this.validatePosition(range.start);
        const end = this.validatePosition(range.end);

        if (start === range.start && end === range.end) {
            return range;
        }
        return new Range(start.line, start.character, end.line, end.character);
    }

    private getText(): string {
        return this.lines.join(this.eol);
    }

    private validatePosition(position: theia.Position): theia.Position {
        if (!(position instanceof Position)) {
            throw new Error('Invalid argument');
        }

        let { line, character } = position;
        let hasChanged = false;

        if (line < 0) {
            line = 0;
            character = 0;
            hasChanged = true;
        } else if (line >= this.lines.length) {
            line = this.lines.length - 1;
            character = this.lines[line].length;
            hasChanged = true;
        } else {
            const maxCharacter = this.lines[line].length;
            if (character < 0) {
                character = 0;
                hasChanged = true;
            } else if (character > maxCharacter) {
                character = maxCharacter;
                hasChanged = true;
            }
        }

        if (!hasChanged) {
            return position;
        }
        return new Position(line, character);
    }

    private lineAt(lineOrPosition: number | theia.Position): theia.TextLine {

        let line: number = -1;
        if (lineOrPosition instanceof Position) {
            line = lineOrPosition.line;
        } else if (typeof lineOrPosition === 'number') {
            line = lineOrPosition;
        }

        if (line < 0 || line >= this.lines.length) {
            throw new Error('Illegal value for `line`');
        }

        let result = this.textLines[line];
        if (!result || result.lineNumber !== line || result.text !== this.lines[line]) {

            const text = this.lines[line];
            const firstNonWhitespaceCharacterIndex = /^(\s*)/.exec(text)![1].length;
            const range = new Range(line, 0, line, text.length);
            const rangeIncludingLineBreak = line < this.lines.length - 1
                ? new Range(line, 0, line + 1, 0)
                : range;

            result = Object.freeze({
                lineNumber: line,
                range,
                rangeIncludingLineBreak,
                text,
                firstNonWhitespaceCharacterIndex,
                isEmptyOrWhitespace: firstNonWhitespaceCharacterIndex === text.length
            });

            this.textLines[line] = result;
        }

        return result;
    }

    private offsetAt(position: theia.Position): number {
        position = this.validatePosition(position);
        this.ensureLineStarts();
        return this.lineStarts!.getAccumulatedValue(position.line - 1) + position.character;
    }

    private ensureLineStarts(): void {
        if (!this.lineStarts) {
            const eolLength = this.eol.length;
            const linesLength = this.lines.length;
            const lineStartValues = new Uint32Array(linesLength);
            for (let i = 0; i < linesLength; i++) {
                lineStartValues[i] = this.lines[i].length + eolLength;
            }
            this.lineStarts = new PrefixSumComputer(lineStartValues);
        }
    }

    private positionAt(offset: number): theia.Position {
        offset = Math.floor(offset);
        offset = Math.max(0, offset);

        this.ensureLineStarts();
        const out = this.lineStarts!.getIndexOf(offset);

        const lineLength = this.lines[out.index].length;

        return new Position(out.index, Math.min(out.remainder, lineLength));
    }

    private getWordRangeAtPosition(_position: theia.Position, regexp?: RegExp): theia.Range | undefined {
        const position = this.validatePosition(_position);

        if (!regexp) {
            // use default when custom-regexp isn't provided
            regexp = getWordDefinitionFor(this.languageId);

        } else if (regExpLeadsToEndlessLoop(regexp)) {
            // use default when custom-regexp is bad
            console.warn(`[getWordRangeAtPosition]: ignoring custom regexp '${regexp.source}' because it matches the empty string.`);
            regexp = getWordDefinitionFor(this.languageId);
        }

        const wordAtText = getWordAtText(
            position.character + 1,
            ensureValidWordDefinition(regexp),
            this.lines[position.line],
            0
        );

        if (wordAtText) {
            return new Range(position.line, wordAtText.startColumn - 1, position.line, wordAtText.endColumn - 1);
        }
        return undefined;
    }
}

export function regExpLeadsToEndlessLoop(regexp: RegExp): boolean {
    // Exit early if it's one of these special cases which are meant to match
    // against an empty string
    if (regexp.source === '^' || regexp.source === '^$' || regexp.source === '$' || regexp.source === '^\\s*$') {
        return false;
    }

    // We check against an empty string. If the regular expression doesn't advance
    // (e.g. ends in an endless loop) it will match an empty string.
    const match = regexp.exec('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (match && <any>regexp.lastIndex === 0)!;
}
