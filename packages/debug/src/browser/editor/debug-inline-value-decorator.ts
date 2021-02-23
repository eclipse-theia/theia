/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Based on https://github.com/theia-ide/vscode/blob/standalone/0.19.x/src/vs/workbench/contrib/debug/browser/debugEditorContribution.ts

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application';
import { MonacoEditorService } from '@theia/monaco/lib/browser/monaco-editor-service';
import { ExpressionContainer, DebugVariable } from '../console/debug-console-items';
import { DebugPreferences } from '../debug-preferences';
import { DebugEditorModel } from './debug-editor-model';
import { DebugStackFrame } from '../model/debug-stack-frame';

// https://github.com/theia-ide/vscode/blob/standalone/0.19.x/src/vs/workbench/contrib/debug/browser/debugEditorContribution.ts#L40-L43
export const INLINE_VALUE_DECORATION_KEY = 'inlinevaluedecoration';
const MAX_NUM_INLINE_VALUES = 100; // JS Global scope can have 700+ entries. We want to limit ourselves for perf reasons
const MAX_INLINE_DECORATOR_LENGTH = 150; // Max string length of each inline decorator when debugging. If exceeded ... is added
const MAX_TOKENIZATION_LINE_LEN = 500; // If line is too long, then inline values for the line are skipped
const { DEFAULT_WORD_REGEXP } = monaco.wordHelper;

/**
 * MAX SMI (SMall Integer) as defined in v8.
 * one bit is lost for boxing/unboxing flag.
 * one bit is lost for sign flag.
 * See https://thibaultlaurens.github.io/javascript/2013/04/29/how-the-v8-engine-works/#tagged-values
 */
// https://github.com/theia-ide/vscode/blob/standalone/0.19.x/src/vs/base/common/uint.ts#L7-L13
const MAX_SAFE_SMALL_INTEGER = 1 << 30;

// https://github.com/theia-ide/vscode/blob/standalone/0.19.x/src/vs/editor/common/modes.ts#L88-L97
const enum StandardTokenType {
    Other = 0,
    Comment = 1,
    String = 2,
    RegEx = 4
};

@injectable()
export class DebugInlineValueDecorator implements FrontendApplicationContribution {

    @inject(MonacoEditorService)
    protected readonly editorService: MonacoEditorService;

    @inject(DebugPreferences)
    protected readonly preferences: DebugPreferences;

    protected enabled = false;
    protected wordToLineNumbersMap: Map<string, monaco.Position[]> | undefined = new Map(); // TODO: can we get rid of this field?

    onStart(): void {
        this.editorService.registerDecorationType(INLINE_VALUE_DECORATION_KEY, {});
        this.enabled = !!this.preferences['debug.inlineValues'];
        this.preferences.onPreferenceChanged(({ preferenceName, newValue }) => {
            if (preferenceName === 'debug.inlineValues' && !!newValue !== this.enabled) {
                this.enabled = !!newValue;
            }
        });
    }

    async calculateDecorations(debugEditorModel: DebugEditorModel, stackFrame: DebugStackFrame | undefined): Promise<monaco.editor.IDecorationOptions[]> {
        this.wordToLineNumbersMap = undefined;
        const model = debugEditorModel.editor.getControl().getModel() || undefined;
        return this.updateInlineValueDecorations(model, stackFrame);
    }

    // https://github.com/theia-ide/vscode/blob/standalone/0.19.x/src/vs/workbench/contrib/debug/browser/debugEditorContribution.ts#L382-L408
    protected async updateInlineValueDecorations(
        model: monaco.editor.ITextModel | undefined,
        stackFrame: DebugStackFrame | undefined): Promise<monaco.editor.IDecorationOptions[]> {

        if (!this.enabled || !model || !stackFrame || !stackFrame.source || model.uri.toString() !== stackFrame.source.uri.toString()) {
            return [];
        }

        // XXX: Here is a difference between the VS Code's `IStackFrame` and the `DebugProtocol.StackFrame`.
        // In DAP, `source` is optional, hence `range` is optional too.
        const { range: stackFrameRange } = stackFrame;
        if (!stackFrameRange) {
            return [];
        }

        const scopes = await stackFrame.getMostSpecificScopes(stackFrameRange);
        // Get all top level children in the scope chain
        const decorationsPerScope = await Promise.all(scopes.map(async scope => {
            const children = Array.from(await scope.getElements());
            let range = new monaco.Range(0, 0, stackFrameRange.startLineNumber, stackFrameRange.startColumn);
            if (scope.range) {
                range = range.setStartPosition(scope.range.startLineNumber, scope.range.startColumn);
            }

            return this.createInlineValueDecorationsInsideRange(children, range, model);
        }));

        return decorationsPerScope.reduce((previous, current) => previous.concat(current), []);
    }

    // https://github.com/theia-ide/vscode/blob/standalone/0.19.x/src/vs/workbench/contrib/debug/browser/debugEditorContribution.ts#L410-L452
    private createInlineValueDecorationsInsideRange(
        expressions: ReadonlyArray<ExpressionContainer>,
        range: monaco.Range,
        model: monaco.editor.ITextModel): monaco.editor.IDecorationOptions[] {

        const nameValueMap = new Map<string, string>();
        for (const expr of expressions) {
            if (expr instanceof DebugVariable) { // XXX: VS Code uses `IExpression` that has `name` and `value`.
                nameValueMap.set(expr.name, expr.value);
            }
            // Limit the size of map. Too large can have a perf impact
            if (nameValueMap.size >= MAX_NUM_INLINE_VALUES) {
                break;
            }
        }

        const lineToNamesMap: Map<number, string[]> = new Map<number, string[]>();
        const wordToPositionsMap = this.getWordToPositionsMap(model);

        // Compute unique set of names on each line
        nameValueMap.forEach((_, name) => {
            const positions = wordToPositionsMap.get(name);
            if (positions) {
                for (const position of positions) {
                    if (range.containsPosition(position)) {
                        if (!lineToNamesMap.has(position.lineNumber)) {
                            lineToNamesMap.set(position.lineNumber, []);
                        }

                        if (lineToNamesMap.get(position.lineNumber)!.indexOf(name) === -1) {
                            lineToNamesMap.get(position.lineNumber)!.push(name);
                        }
                    }
                }
            }
        });

        const decorations: monaco.editor.IDecorationOptions[] = [];
        // Compute decorators for each line
        lineToNamesMap.forEach((names, line) => {
            const contentText = names.sort((first, second) => {
                const content = model.getLineContent(line);
                return content.indexOf(first) - content.indexOf(second);
            }).map(name => `${name} = ${nameValueMap.get(name)}`).join(', ');
            decorations.push(this.createInlineValueDecoration(line, contentText));
        });

        return decorations;
    }

    // https://github.com/theia-ide/vscode/blob/standalone/0.19.x/src/vs/workbench/contrib/debug/browser/debugEditorContribution.ts#L454-L485
    private createInlineValueDecoration(lineNumber: number, contentText: string): monaco.editor.IDecorationOptions {
        // If decoratorText is too long, trim and add ellipses. This could happen for minified files with everything on a single line
        if (contentText.length > MAX_INLINE_DECORATOR_LENGTH) {
            contentText = contentText.substr(0, MAX_INLINE_DECORATOR_LENGTH) + '...';
        }

        return {
            color: undefined, // XXX: check inconsistency between APIs. `color` seems to be mandatory from `monaco-editor-core`.
            range: {
                startLineNumber: lineNumber,
                endLineNumber: lineNumber,
                startColumn: MAX_SAFE_SMALL_INTEGER,
                endColumn: MAX_SAFE_SMALL_INTEGER
            },
            renderOptions: {
                after: {
                    contentText,
                    backgroundColor: 'rgba(255, 200, 0, 0.2)',
                    margin: '10px'
                },
                dark: {
                    after: {
                        color: 'rgba(255, 255, 255, 0.5)',
                    }
                },
                light: {
                    after: {
                        color: 'rgba(0, 0, 0, 0.5)',
                    }
                }
            }
        };
    }

    // https://github.com/theia-ide/vscode/blob/standalone/0.19.x/src/vs/workbench/contrib/debug/browser/debugEditorContribution.ts#L487-L531
    private getWordToPositionsMap(model: monaco.editor.ITextModel): Map<string, monaco.Position[]> {
        if (!this.wordToLineNumbersMap) {
            this.wordToLineNumbersMap = new Map<string, monaco.Position[]>();
            if (!model) {
                return this.wordToLineNumbersMap;
            }

            // For every word in every line, map its ranges for fast lookup
            for (let lineNumber = 1, len = model.getLineCount(); lineNumber <= len; ++lineNumber) {
                const lineContent = model.getLineContent(lineNumber);

                // If line is too long then skip the line
                if (lineContent.length > MAX_TOKENIZATION_LINE_LEN) {
                    continue;
                }

                model.forceTokenization(lineNumber);
                const lineTokens = model.getLineTokens(lineNumber);
                for (let tokenIndex = 0, tokenCount = lineTokens.getCount(); tokenIndex < tokenCount; tokenIndex++) {
                    const tokenStartOffset = lineTokens.getStartOffset(tokenIndex);
                    const tokenEndOffset = lineTokens.getEndOffset(tokenIndex);
                    const tokenType = lineTokens.getStandardTokenType(tokenIndex);
                    const tokenStr = lineContent.substring(tokenStartOffset, tokenEndOffset);

                    // Token is a word and not a comment
                    if (tokenType === StandardTokenType.Other) {
                        DEFAULT_WORD_REGEXP.lastIndex = 0; // We assume tokens will usually map 1:1 to words if they match
                        const wordMatch = DEFAULT_WORD_REGEXP.exec(tokenStr);

                        if (wordMatch) {
                            const word = wordMatch[0];
                            if (!this.wordToLineNumbersMap.has(word)) {
                                this.wordToLineNumbersMap.set(word, []);
                            }

                            this.wordToLineNumbersMap.get(word)!.push(new monaco.Position(lineNumber, tokenStartOffset));
                        }
                    }
                }
            }
        }

        return this.wordToLineNumbersMap;
    }

}
