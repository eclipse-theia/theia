// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************
import { TextEditorConfiguration, TextEditorsMain, TextEditorConfigurationUpdate, SingleEditOperation } from '../common/plugin-api-rpc';
import { Range as ApiRange } from '../common/plugin-api-rpc-model';
import { Selection, Range, TextEditorLineNumbersStyle, SnippetString, Position, TextEditorRevealType, EndOfLine } from './types-impl';
import * as theia from '@theia/plugin';
import { DocumentDataExt } from './document-data';
import { readonly, illegalArgument } from '../common/errors';
import { TextEditorCursorStyle } from '../common/editor-options';
import { ok } from '../common/assert';
import * as Converter from './type-converters';

export class TextEditorExt implements theia.TextEditor {
    private _viewColumn: theia.ViewColumn | undefined;
    private _document: DocumentDataExt;
    private _options: TextEditorOptionsExt;
    private disposed = false;
    constructor(
        private readonly proxy: TextEditorsMain,
        private readonly id: string,
        document: DocumentDataExt,
        private _selections: Selection[],
        options: TextEditorConfiguration,
        private _visibleRanges: Range[],
        viewColumn: theia.ViewColumn | undefined) {
        this._options = new TextEditorOptionsExt(proxy, id, options);
        this._viewColumn = viewColumn;
        this._document = document;
    }

    get document(): theia.TextDocument {
        return this._document.document;
    }

    set document(doc) {
        throw readonly('Document');
    }

    acceptViewColumn(val: theia.ViewColumn): void {
        this._viewColumn = val;
    }

    dispose(): void {
        this.disposed = true;
    }

    get options(): theia.TextEditorOptions {
        return this._options;
    }

    set options(val: theia.TextEditorOptions) {
        if (!this.disposed) {
            this._options.assign(val);
        }
    }

    acceptOptions(options: TextEditorConfiguration): void {
        ok(!this.disposed);
        this._options.accept(options);
    }

    get selection(): Selection {
        return this._selections && this._selections[0];
    }

    set selection(val: Selection) {
        if (!(val instanceof Selection)) {
            throw illegalArgument('selection');
        }
        this._selections = [val];
        this.trySetSelection();
    }

    private trySetSelection(): Promise<theia.TextEditor | undefined> {
        const selection = this._selections.map(Converter.fromSelection);
        return this.runOnProxy(() => this.proxy.$trySetSelections(this.id, selection));
    }

    get selections(): Selection[] {
        return this._selections;
    }

    set selections(val: Selection[]) {
        if (!Array.isArray(val) || val.some(s => !(s instanceof Selection))) {
            throw illegalArgument('selections');
        }

        this._selections = val;
        this.trySetSelection();
    }

    acceptSelections(selections: Selection[]): void {
        ok(!this.disposed);
        this._selections = selections;
    }

    get visibleRanges(): Range[] {
        return this._visibleRanges;
    }

    set visibleRanges(val: Range[]) {
        throw readonly('visibleRanges');
    }

    acceptVisibleRanges(range: Range[]): void {
        ok(!this.disposed);
        this._visibleRanges = range;
    }

    get viewColumn(): theia.ViewColumn | undefined {
        return this._viewColumn;
    }

    set viewColumn(value) {
        throw readonly('viewColumn');
    }

    _acceptViewColumn(value: theia.ViewColumn): void {
        ok(!this.disposed);
        this._viewColumn = value;
    }

    // eslint-disable-next-line max-len
    edit(callback: (editBuilder: theia.TextEditorEdit) => void, options: { undoStopBefore: boolean; undoStopAfter: boolean; } = { undoStopBefore: true, undoStopAfter: true }): Promise<boolean> {
        if (this.disposed) {
            return Promise.reject(new Error('TextEditor#edit not possible on closed editor'));
        }

        const edit = new TextEditorEdit(this._document.document, options);
        callback(edit);
        return this.applyEdit(edit);
    }
    // eslint-disable-next-line max-len
    insertSnippet(snippet: SnippetString, location?: Position | Range | Position[] | Range[], options: { undoStopBefore: boolean; undoStopAfter: boolean; } = { undoStopBefore: true, undoStopAfter: true }): Promise<boolean> {
        if (this.disposed) {
            return Promise.reject(new Error('TextEditor#insertSnippet not possible on closed editors'));
        }
        let ranges: ApiRange[];

        if (!location || (Array.isArray(location) && location.length === 0)) {
            ranges = this._selections.map(s => Converter.fromRange(s)!);

        } else if (location instanceof Position) {
            const { lineNumber, column } = Converter.fromPosition(location);
            ranges = [{ startLineNumber: lineNumber, startColumn: column, endLineNumber: lineNumber, endColumn: column }];

        } else if (location instanceof Range) {
            ranges = [Converter.fromRange(location)!];
        } else {
            ranges = [];
            for (const posOrRange of location) {
                if (posOrRange instanceof Range) {
                    ranges.push(Converter.fromRange(posOrRange)!);
                } else {
                    const { lineNumber, column } = Converter.fromPosition(posOrRange);
                    ranges.push({ startLineNumber: lineNumber, startColumn: column, endLineNumber: lineNumber, endColumn: column });
                }
            }
        }

        return this.proxy.$tryInsertSnippet(this.id, snippet.value, ranges, options);
    }
    setDecorations(decorationType: theia.TextEditorDecorationType, rangesOrOptions: Range[] | theia.DecorationOptions[]): void {
        this.runOnProxy(() => {
            if (Converter.isDecorationOptionsArr(rangesOrOptions)) {
                return this.proxy.$trySetDecorations(
                    this.id,
                    decorationType.key,
                    Converter.fromRangeOrRangeWithMessage(rangesOrOptions)
                );
            } else {
                const ranges: number[] = new Array<number>(4 * rangesOrOptions.length);
                const len = rangesOrOptions.length;
                for (let i = 0; i < len; i++) {
                    const range = rangesOrOptions[i];
                    ranges[4 * i] = range.start.line + 1;
                    ranges[4 * i + 1] = range.start.character + 1;
                    ranges[4 * i + 2] = range.end.line + 1;
                    ranges[4 * i + 3] = range.end.character + 1;
                }
                return this.proxy.$trySetDecorationsFast(
                    this.id,
                    decorationType.key,
                    ranges
                );
            }
        });
    }

    revealRange(range: Range, revealType?: theia.TextEditorRevealType): void {
        this.runOnProxy(() => this.proxy.$tryRevealRange(this.id, Converter.fromRange(range)!, (revealType || TextEditorRevealType.Default)));
    }

    private applyEdit(edit: TextEditorEdit): Promise<boolean> {
        const editData = edit.finalize();

        const editRanges = editData.edits.map(e => e.range);

        editRanges.sort((a, b) => {
            if (a.end.line === b.end.line) {
                if (a.end.character === b.end.character) {
                    if (a.start.line === b.start.line) {
                        return a.start.character - b.start.character;
                    }
                    return a.start.line - b.start.line;
                }
                return a.end.character - b.end.character;
            }
            return a.end.line - b.end.line;
        });

        const count = editRanges.length - 1;
        for (let i = 0; i < count; i++) {
            const rangeEnd = editRanges[i].end;
            const nextRangeStart = editRanges[i + 1].start;

            if (nextRangeStart.isBefore(rangeEnd)) {
                return Promise.reject(
                    new Error('Overlapping ranges are not allowed!')
                );
            }
        }

        // prepare data for serialization
        const edits: SingleEditOperation[] = editData.edits.map(e =>
        ({
            range: Converter.fromRange(e.range)!,
            text: e.text,
            forceMoveMarkers: e.forceMoveMarkers
        }));

        return this.proxy.$tryApplyEdits(this.id, editData.documentVersionId, edits, {
            setEndOfLine: editData.setEndOfLine,
            undoStopBefore: editData.undoStopBefore,
            undoStopAfter: editData.undoStopAfter
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private runOnProxy(callback: () => Promise<any>): Promise<TextEditorExt | undefined> {
        if (this.disposed) {
            console.warn('TextEditor is disposed!');
            return Promise.resolve(undefined);
        }

        return callback().then(() => this, err => {
            if (!(err instanceof Error && err.name === 'DISPOSED')) {
                console.warn(err);
            }
            return undefined;
        });
    }

    show(column?: theia.ViewColumn): void {
        this.proxy.$tryShowTextDocument(this.document.uri, {
            viewColumn: column,
            preview: true,
        });
    }

    hide(): void {
        this.proxy.$tryHideEditor(this.id);
    }
}

export class TextEditorOptionsExt implements theia.TextEditorOptions {
    private _tabSize?: number;
    private _insertSpace: boolean;
    private _cursorStyle: TextEditorCursorStyle;
    private _lineNumbers: TextEditorLineNumbersStyle;
    constructor(private readonly proxy: TextEditorsMain,
        private readonly id: string,
        source: TextEditorConfiguration) {
        this.accept(source);
    }

    accept(source: TextEditorConfiguration): void {
        this._tabSize = source.tabSize;
        this._insertSpace = source.insertSpaces;
        this._cursorStyle = source.cursorStyle;
        this._lineNumbers = source.lineNumbers;
    }

    get tabSize(): number | string | undefined {
        return this._tabSize;
    }

    set tabSize(val: number | string | undefined) {
        const tabSize = this.validateTabSize(val);
        if (!tabSize) {
            return; // ignore invalid values
        }

        if (typeof tabSize === 'number') {
            if (this.tabSize === tabSize) {
                return;
            }
            this.tabSize = tabSize;
        }
        warnOnError(this.proxy.$trySetOptions(this.id, {
            tabSize
        }));
    }

    private validateTabSize(val: number | string | undefined): number | 'auto' | undefined {
        if (val === 'auto') {
            return 'auto';
        }

        if (typeof val === 'number') {
            const r = Math.floor(val);
            return r > 0 ? r : undefined;
        }
        if (typeof val === 'string') {
            const r = parseInt(val, undefined);
            if (isNaN(r)) {
                return undefined;
            }
            return r > 0 ? r : undefined;
        }
        return undefined;
    }

    get insertSpaces(): boolean | string {
        return this._insertSpace;
    }

    set insertSpaces(val: boolean | string) {
        const insertSpaces = this.validateInsertSpaces(val);
        if (typeof insertSpaces === 'boolean') {
            if (this._insertSpace === insertSpaces) {
                return;
            }
            this._insertSpace = insertSpaces;
        }
        warnOnError(this.proxy.$trySetOptions(this.id, { insertSpaces }));
    }

    private validateInsertSpaces(val: boolean | string): boolean | 'auto' {
        if (val === 'auto') {
            return 'auto';
        }
        return val === 'false' ? false : Boolean(val);
    }

    get cursorStyle(): TextEditorCursorStyle {
        return this._cursorStyle;
    }

    set cursorStyle(val: TextEditorCursorStyle) {
        if (this._cursorStyle === val) {
            return;
        }
        this._cursorStyle = val;
        warnOnError(this.proxy.$trySetOptions(this.id, { cursorStyle: val }));
    }

    get lineNumbers(): TextEditorLineNumbersStyle {
        return this._lineNumbers;
    }
    set lineNumbers(val: TextEditorLineNumbersStyle) {
        if (this._lineNumbers === val) {
            return;
        }
        this._lineNumbers = val;
        warnOnError(this.proxy.$trySetOptions(this.id, { lineNumbers: val }));
    }

    public assign(newOptions: theia.TextEditorOptions): void {
        const configurationUpdate: TextEditorConfigurationUpdate = {};
        let hasUpdate = false;

        if (typeof newOptions.tabSize !== 'undefined') {
            const tabSize = this.validateTabSize(newOptions.tabSize);
            if (tabSize === 'auto') {
                hasUpdate = true;
                configurationUpdate.tabSize = tabSize;
            } else if (typeof tabSize === 'number' && this._tabSize !== tabSize) {
                this._tabSize = tabSize;
                hasUpdate = true;
                configurationUpdate.tabSize = tabSize;
            }
        }

        if (typeof newOptions.insertSpaces !== 'undefined') {
            const insertSpaces = this.validateInsertSpaces(newOptions.insertSpaces);
            if (insertSpaces === 'auto') {
                hasUpdate = true;
                configurationUpdate.insertSpaces = insertSpaces;
            } else if (this.insertSpaces !== insertSpaces) {
                this.insertSpaces = insertSpaces;
                hasUpdate = true;
                configurationUpdate.insertSpaces = insertSpaces;
            }
        }

        if (typeof newOptions.cursorStyle !== 'undefined') {
            if (this._cursorStyle !== newOptions.cursorStyle) {
                this._cursorStyle = newOptions.cursorStyle;
                hasUpdate = true;
                configurationUpdate.cursorStyle = newOptions.cursorStyle;
            }
        }

        if (typeof newOptions.lineNumbers !== 'undefined') {
            if (this._lineNumbers !== newOptions.lineNumbers) {
                this._lineNumbers = newOptions.lineNumbers;
                hasUpdate = true;
                configurationUpdate.lineNumbers = newOptions.lineNumbers;
            }
        }

        if (hasUpdate) {
            warnOnError(this.proxy.$trySetOptions(this.id, configurationUpdate));
        }
    }

}

export interface TextEditOperation {
    range: theia.Range;
    text?: string;
    forceMoveMarkers: boolean;
}

export interface EditData {
    documentVersionId: number;
    edits: TextEditOperation[];
    setEndOfLine: EndOfLine;
    undoStopBefore: boolean;
    undoStopAfter: boolean;
}

export class TextEditorEdit {
    private readonly documentVersionId: number;
    private collectedEdits: TextEditOperation[];
    private eol: EndOfLine;
    private readonly undoStopBefore: boolean;
    private readonly undoStopAfter: boolean;
    constructor(private document: theia.TextDocument, options: { undoStopBefore: boolean; undoStopAfter: boolean }) {
        this.documentVersionId = document.version;
        this.collectedEdits = [];
        this.eol = 0;
        this.undoStopBefore = options.undoStopBefore;
        this.undoStopAfter = options.undoStopAfter;
    }

    finalize(): EditData {
        return {
            documentVersionId: this.documentVersionId,
            edits: this.collectedEdits,
            setEndOfLine: this.eol,
            undoStopAfter: this.undoStopAfter,
            undoStopBefore: this.undoStopBefore
        };
    }

    replace(location: Position | Range | Selection, val: string): void {
        let range: Range;
        if (location instanceof Position) {
            range = new Range(location, location);
        } else if (location instanceof Range) {
            range = location;
        } else {
            throw new Error('Unknown location');
        }

        this.addEdit(range, val, false);
    }

    insert(location: Position, val: string): void {
        this.addEdit(new Range(location, location), val, true);
    }

    delete(location: Range | Selection): void {
        let range: Range;
        if (location instanceof Range) {
            range = location;
        } else {
            throw new Error('Unknown location');
        }

        this.addEdit(range, undefined, true);
    }

    setEndOfLine(endOfLine: EndOfLine): void {
        if (endOfLine !== EndOfLine.CRLF && endOfLine !== EndOfLine.LF) {
            throw illegalArgument('endOfLine');
        }

        this.eol = endOfLine;
    }

    private addEdit(range: Range, text: string | undefined, moveMarkers: boolean): void {
        const validatedRange = this.document.validateRange(range);
        this.collectedEdits.push({
            range: validatedRange,
            forceMoveMarkers: moveMarkers,
            text: text
        });
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function warnOnError(promise: Promise<any>): void {
    promise.then(undefined, err => {
        console.warn(err);
    });
}
