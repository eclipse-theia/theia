// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Based on https://github.com/theia-ide/vscode/blob/standalone/0.19.x/src/vs/workbench/contrib/debug/browser/debugEditorContribution.ts

import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { inject, injectable } from '@theia/core/shared/inversify';
import * as monaco from '@theia/monaco-editor-core';
import { CancellationTokenSource } from '@theia/monaco-editor-core/esm/vs/base/common/cancellation';
import { DEFAULT_WORD_REGEXP } from '@theia/monaco-editor-core/esm/vs/editor/common/core/wordHelper';
import { IDecorationOptions } from '@theia/monaco-editor-core/esm/vs/editor/common/editorCommon';
import { StandardTokenType } from '@theia/monaco-editor-core/esm/vs/editor/common/encodedTokenAttributes';
import { InlineValueContext } from '@theia/monaco-editor-core/esm/vs/editor/common/languages';
import { ITextModel } from '@theia/monaco-editor-core/esm/vs/editor/common/model';
import { ILanguageFeaturesService } from '@theia/monaco-editor-core/esm/vs/editor/common/services/languageFeatures';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { DebugVariable, ExpressionContainer, ExpressionItem } from '../console/debug-console-items';
import { DebugPreferences } from '../debug-preferences';
import { DebugStackFrame } from '../model/debug-stack-frame';
import { DebugEditorModel } from './debug-editor-model';
import { ICodeEditorService } from '@theia/monaco-editor-core/esm/vs/editor/browser/services/codeEditorService';

// https://github.com/theia-ide/vscode/blob/standalone/0.19.x/src/vs/workbench/contrib/debug/browser/debugEditorContribution.ts#L40-L43
export const INLINE_VALUE_DECORATION_KEY = 'inlinevaluedecoration';
const MAX_NUM_INLINE_VALUES = 100; // JS Global scope can have 700+ entries. We want to limit ourselves for perf reasons
const MAX_INLINE_DECORATOR_LENGTH = 150; // Max string length of each inline decorator when debugging. If exceeded ... is added
const MAX_TOKENIZATION_LINE_LEN = 500; // If line is too long, then inline values for the line are skipped

/**
 * MAX SMI (SMall Integer) as defined in v8.
 * one bit is lost for boxing/unboxing flag.
 * one bit is lost for sign flag.
 * See https://thibaultlaurens.github.io/javascript/2013/04/29/how-the-v8-engine-works/#tagged-values
 */
// https://github.com/theia-ide/vscode/blob/standalone/0.19.x/src/vs/base/common/uint.ts#L7-L13
const MAX_SAFE_SMALL_INTEGER = 1 << 30;

class InlineSegment {
    constructor(public column: number, public text: string) {
    }
}

@injectable()
export class DebugInlineValueDecorator implements FrontendApplicationContribution {
    @inject(DebugPreferences)
    protected readonly preferences: DebugPreferences;

    protected enabled = false;
    protected wordToLineNumbersMap: Map<string, monaco.Position[]> | undefined = new Map();

    onStart(): void {
        StandaloneServices.get(ICodeEditorService).registerDecorationType('Inline debug decorations', INLINE_VALUE_DECORATION_KEY, {});
        this.enabled = !!this.preferences['debug.inlineValues'];
        this.preferences.onPreferenceChanged(({ preferenceName, newValue }) => {
            if (preferenceName === 'debug.inlineValues' && !!newValue !== this.enabled) {
                this.enabled = !!newValue;
            }
        });
    }

    async calculateDecorations(debugEditorModel: DebugEditorModel, stackFrame: DebugStackFrame | undefined): Promise<IDecorationOptions[]> {
        this.wordToLineNumbersMap = undefined;
        const model = debugEditorModel.editor.getControl().getModel() || undefined;
        return this.updateInlineValueDecorations(debugEditorModel, model, stackFrame);
    }

    // https://github.com/theia-ide/vscode/blob/standalone/0.19.x/src/vs/workbench/contrib/debug/browser/debugEditorContribution.ts#L382-L408
    protected async updateInlineValueDecorations(
        debugEditorModel: DebugEditorModel,
        model: monaco.editor.ITextModel | undefined,
        stackFrame: DebugStackFrame | undefined): Promise<IDecorationOptions[]> {

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

            return this.createInlineValueDecorationsInsideRange(children, range, model, debugEditorModel, stackFrame);
        }));

        return decorationsPerScope.reduce((previous, current) => previous.concat(current), []);
    }

    // https://github.com/theia-ide/vscode/blob/standalone/0.19.x/src/vs/workbench/contrib/debug/browser/debugEditorContribution.ts#L410-L452
    private async createInlineValueDecorationsInsideRange(
        expressions: ReadonlyArray<ExpressionContainer>,
        range: monaco.Range,
        model: monaco.editor.ITextModel,
        debugEditorModel: DebugEditorModel,
        stackFrame: DebugStackFrame): Promise<IDecorationOptions[]> {

        const decorations: IDecorationOptions[] = [];

        const inlineValuesProvider = StandaloneServices.get(ILanguageFeaturesService).inlineValuesProvider;
        const textEditorModel = debugEditorModel.editor.document.textEditorModel;

        if (inlineValuesProvider && inlineValuesProvider.has(textEditorModel)) {

            const findVariable = async (variableName: string, caseSensitiveLookup: boolean): Promise<DebugVariable | undefined> => {
                const scopes = await stackFrame.getMostSpecificScopes(stackFrame.range!);
                const key = caseSensitiveLookup ? variableName : variableName.toLowerCase();
                for (const scope of scopes) {
                    const expressionContainers = await scope.getElements();
                    let container = expressionContainers.next();
                    while (!container.done) {
                        const debugVariable = container.value;
                        if (debugVariable && debugVariable instanceof DebugVariable) {
                            if (caseSensitiveLookup) {
                                if (debugVariable.name === key) {
                                    return debugVariable;
                                }
                            } else {
                                if (debugVariable.name.toLowerCase() === key) {
                                    return debugVariable;
                                }
                            }
                        }
                        container = expressionContainers.next();
                    }
                }
                return undefined;
            };

            const context: InlineValueContext = {
                frameId: stackFrame.raw.id,
                stoppedLocation: range
            };

            const cancellationToken = new CancellationTokenSource().token;
            const registeredProviders = inlineValuesProvider.ordered(textEditorModel).reverse();
            const visibleRanges = debugEditorModel.editor.getControl().getVisibleRanges();

            const lineDecorations = new Map<number, InlineSegment[]>();

            for (const provider of registeredProviders) {
                for (const visibleRange of visibleRanges) {
                    const result = await provider.provideInlineValues(textEditorModel, visibleRange, context, cancellationToken);
                    if (result) {
                        for (const inlineValue of result) {
                            let text: string | undefined = undefined;
                            switch (inlineValue.type) {
                                case 'text':
                                    text = inlineValue.text;
                                    break;
                                case 'variable': {
                                    let varName = inlineValue.variableName;
                                    if (!varName) {
                                        const lineContent = model.getLineContent(inlineValue.range.startLineNumber);
                                        varName = lineContent.substring(inlineValue.range.startColumn - 1, inlineValue.range.endColumn - 1);
                                    }
                                    const variable = await findVariable(varName, inlineValue.caseSensitiveLookup);
                                    if (variable) {
                                        text = this.formatInlineValue(varName, variable.value);
                                    }
                                    break;
                                }
                                case 'expression': {
                                    let expr = inlineValue.expression;
                                    if (!expr) {
                                        const lineContent = model.getLineContent(inlineValue.range.startLineNumber);
                                        expr = lineContent.substring(inlineValue.range.startColumn - 1, inlineValue.range.endColumn - 1);
                                    }
                                    if (expr) {
                                        const expression = new ExpressionItem(expr, () => stackFrame.thread.session);
                                        await expression.evaluate('watch');
                                        if (expression.available) {
                                            text = this.formatInlineValue(expr, expression.value);
                                        }
                                    }
                                    break;
                                }
                            }

                            if (text) {
                                const line = inlineValue.range.startLineNumber;
                                let lineSegments = lineDecorations.get(line);
                                if (!lineSegments) {
                                    lineSegments = [];
                                    lineDecorations.set(line, lineSegments);
                                }
                                if (!lineSegments.some(segment => segment.text === text)) {
                                    lineSegments.push(new InlineSegment(inlineValue.range.startColumn, text));
                                }
                            }
                        }
                    }
                }
            };

            // sort line segments and concatenate them into a decoration
            const separator = ', ';
            lineDecorations.forEach((segments, line) => {
                if (segments.length > 0) {
                    segments = segments.sort((a, b) => a.column - b.column);
                    const text = segments.map(s => s.text).join(separator);
                    decorations.push(this.createInlineValueDecoration(line, text));
                }
            });

        } else { // use fallback if no provider was registered
            const lineToNamesMap: Map<number, string[]> = new Map<number, string[]>();
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

            // Compute decorators for each line
            lineToNamesMap.forEach((names, line) => {
                const contentText = names.sort((first, second) => {
                    const content = model.getLineContent(line);
                    return content.indexOf(first) - content.indexOf(second);
                }).map(name => `${name} = ${nameValueMap.get(name)}`).join(', ');
                decorations.push(this.createInlineValueDecoration(line, contentText));
            });
        }

        return decorations;
    }

    protected formatInlineValue(...args: string[]): string {
        const valuePattern = '{0} = {1}';
        const formatRegExp = /{(\d+)}/g;
        if (args.length === 0) {
            return valuePattern;
        }
        return valuePattern.replace(formatRegExp, (match, group) => {
            const idx = parseInt(group, 10);
            return isNaN(idx) || idx < 0 || idx >= args.length ?
                match :
                args[idx];
        });
    }

    // https://github.com/theia-ide/vscode/blob/standalone/0.19.x/src/vs/workbench/contrib/debug/browser/debugEditorContribution.ts#L454-L485
    private createInlineValueDecoration(lineNumber: number, contentText: string): IDecorationOptions {
        // If decoratorText is too long, trim and add ellipses. This could happen for minified files with everything on a single line
        if (contentText.length > MAX_INLINE_DECORATOR_LENGTH) {
            contentText = contentText.substring(0, MAX_INLINE_DECORATOR_LENGTH) + '...';
        }

        return {
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
    private getWordToPositionsMap(model: monaco.editor.ITextModel | ITextModel): Map<string, monaco.Position[]> {
        model = model as ITextModel;
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

                model.tokenization.forceTokenization(lineNumber);
                const lineTokens = model.tokenization.getLineTokens(lineNumber);
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
