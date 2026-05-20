// *****************************************************************************
// Copyright (C) 2025 Lonti.com Pty Ltd.
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

import { PreferenceService } from '@theia/core/lib/common';
import { Container } from '@theia/core/shared/inversify';
import { editor, languages, Uri } from '@theia/monaco-editor-core/esm/vs/editor/editor.api';
import { expect } from 'chai';
import { CodeCompletionVariableContext } from './code-completion-variable-context';
import { CodeCompletionVariableContribution } from './code-completion-variable-contribution';
import { FILE, LANGUAGE, PREFIX, SUFFIX } from './code-completion-variables';

// A minimal fake ITextModel covering just the methods the contribution touches.
// Avoids calling `editor.createModel`, which lazily initializes Monaco's
// StandaloneThemeService and requires browser globals (CSS, matchMedia) that
// JSDOM does not expose.
function createFakeModel(text: string, languageId: string, uri: Uri): editor.ITextModel {
    const lines = text.split('\n');
    return {
        uri,
        getLanguageId: () => languageId,
        getLineCount: () => lines.length,
        getLineMaxColumn: (line: number) => lines[line - 1].length + 1,
        getPositionAt: (offset: number) => {
            let remaining = offset;
            for (let i = 0; i < lines.length; i++) {
                if (remaining <= lines[i].length) {
                    return { lineNumber: i + 1, column: remaining + 1 };
                }
                remaining -= lines[i].length + 1; // account for '\n'
            }
            const last = lines.length - 1;
            return { lineNumber: lines.length, column: lines[last].length + 1 };
        },
        getValueInRange: (range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }) => {
            const parts: string[] = [];
            for (let line = range.startLineNumber; line <= range.endLineNumber; line++) {
                const lineText = lines[line - 1];
                const start = line === range.startLineNumber ? range.startColumn - 1 : 0;
                const end = line === range.endLineNumber ? range.endColumn - 1 : lineText.length;
                parts.push(lineText.substring(start, end));
            }
            return parts.join('\n');
        },
        dispose: () => { /* no-op */ },
    } as unknown as editor.ITextModel;
}

describe('CodeCompletionVariableContribution', () => {
    let contribution: CodeCompletionVariableContribution;
    let model: editor.ITextModel;

    before(() => {
        const container = new Container();
        container.bind(PreferenceService).toConstantValue({
            get: () => 1000,
        });
        container.bind(CodeCompletionVariableContribution).toSelf().inSingletonScope();
        contribution = container.get(CodeCompletionVariableContribution);
    });

    beforeEach(() => {
        model = createFakeModel('//line 1\nconsole.\n//line 2', 'javascript', Uri.file('/home/user/workspace/test.js'));
    });

    describe('canResolve', () => {
        it('should be able to resolve the file from the CodeCompletionVariableContext', () => {
            const context: CodeCompletionVariableContext = {
                model,
                position: model.getPositionAt(8),
                context: {
                    triggerKind: languages.InlineCompletionTriggerKind.Automatic,
                    selectedSuggestionInfo: undefined,
                    includeInlineEdits: false,
                    includeInlineCompletions: false,
                    requestIssuedDateTime: Date.now(),
                    earliestShownDateTime: Date.now()
                }
            };

            expect(contribution.canResolve({ variable: FILE }, context)).to.equal(1);
        });

        it('should not be able to resolve the file from unknown context', () => {
            expect(contribution.canResolve({ variable: FILE }, {})).to.equal(0);
        });
    });

    describe('resolve', () => {
        it('should resolve the file variable', async () => {
            const context: CodeCompletionVariableContext = {
                model,
                position: model.getPositionAt(17),
                context: {
                    triggerKind: languages.InlineCompletionTriggerKind.Automatic,
                    selectedSuggestionInfo: undefined,
                    includeInlineEdits: false,
                    includeInlineCompletions: false,
                    requestIssuedDateTime: Date.now(),
                    earliestShownDateTime: Date.now()
                }
            };

            const resolved = await contribution.resolve({ variable: FILE }, context);
            expect(resolved).to.deep.equal({
                variable: FILE,
                value: 'file:///home/user/workspace/test.js'
            });
        });

        it('should resolve the language variable', async () => {
            const context: CodeCompletionVariableContext = {
                model,
                position: model.getPositionAt(17),
                context: {
                    triggerKind: languages.InlineCompletionTriggerKind.Automatic,
                    selectedSuggestionInfo: undefined,
                    includeInlineEdits: false,
                    includeInlineCompletions: false,
                    requestIssuedDateTime: Date.now(),
                    earliestShownDateTime: Date.now()
                }
            };

            const resolved = await contribution.resolve({ variable: LANGUAGE }, context);
            expect(resolved).to.deep.equal({
                variable: LANGUAGE,
                value: 'javascript'
            });
        });

        it('should resolve the prefix variable', async () => {
            const context: CodeCompletionVariableContext = {
                model,
                position: model.getPositionAt(17),
                context: {
                    triggerKind: languages.InlineCompletionTriggerKind.Automatic,
                    selectedSuggestionInfo: undefined,
                    includeInlineEdits: false,
                    includeInlineCompletions: false,
                    requestIssuedDateTime: Date.now(),
                    earliestShownDateTime: Date.now()
                }
            };

            const resolved = await contribution.resolve({ variable: PREFIX }, context);
            expect(resolved).to.deep.equal({
                variable: PREFIX,
                value: '//line 1\nconsole.'
            });
        });

        it('should resolve the suffix variable', async () => {
            const context: CodeCompletionVariableContext = {
                model,
                position: model.getPositionAt(17),
                context: {
                    triggerKind: languages.InlineCompletionTriggerKind.Automatic,
                    selectedSuggestionInfo: undefined,
                    includeInlineEdits: false,
                    includeInlineCompletions: false,
                    requestIssuedDateTime: Date.now(),
                    earliestShownDateTime: Date.now()
                }
            };

            const resolved = await contribution.resolve({ variable: SUFFIX }, context);
            expect(resolved).to.deep.equal({
                variable: SUFFIX,
                value: '\n//line 2'
            });
        });
    });
});
