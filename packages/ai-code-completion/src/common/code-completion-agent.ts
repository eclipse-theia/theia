// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import * as monaco from '@theia/monaco-editor-core';
import { Agent, getTextOfResponse, LanguageModelRegistry, LanguageModelSelector, PromptService, PromptTemplate } from '@theia/ai-core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';

export const CodeCompletionAgent = Symbol('CodeCompletionAgent');
export interface CodeCompletionAgent extends Agent {
    provideCompletionItems(model: monaco.editor.ITextModel, position: monaco.Position,
        context: monaco.languages.CompletionContext, token: monaco.CancellationToken): Promise<monaco.languages.CompletionList | undefined>;
}

@injectable()
export class CodeCompletionAgentImpl implements CodeCompletionAgent {
    variables: string[];

    @inject(LanguageModelRegistry)
    protected languageModelRegistry: LanguageModelRegistry;

    @inject(PromptService)
    protected promptService: PromptService;

    async provideCompletionItems(model: monaco.editor.ITextModel, position: monaco.Position,
        context: monaco.languages.CompletionContext, token: monaco.CancellationToken): Promise<monaco.languages.CompletionList | undefined> {

        const languageModels = await this.languageModelRegistry.selectLanguageModels({
            agent: 'code-completion-agent',
            purpose: 'code-completion',
            identifier: 'openai/gpt-4o'
        });
        if (languageModels.length === 0) {
            console.error('No language model found for code-completion-agent');
            return undefined;
        }
        const languageModel = languageModels[0];
        console.log('Code completion agent is using language model:', languageModel.id);

        // Get text until the given position
        const textUntilPosition = model.getValueInRange({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column
        });

        // Get text after the given position
        const textAfterPosition = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: model.getLineCount(),
            endColumn: model.getLineMaxColumn(model.getLineCount())
        });

        const snippet = `${textUntilPosition}{{MARKER}}${textAfterPosition}`;
        const file = model.uri.toString(false);
        const language = model.getLanguageId();

        const prompt = await this.promptService.getPrompt('code-completion-prompt', { snippet, file, language });
        if (!prompt) {
            console.error('No prompt found for code-completion-agent');
            return undefined;
        }
        console.log('Code completion agent is using prompt:', prompt);

        const response = await languageModel.request(({ messages: [{ type: 'text', actor: 'user', query: prompt }] }));
        const completionText = await getTextOfResponse(response);
        console.log('Code completion suggests', completionText);

        const suggestions: monaco.languages.CompletionItem[] = [];
        const completionItem: monaco.languages.CompletionItem = {
            preselect: true,
            label: `${completionText.substring(0, 20)}`,
            detail: 'AI Generated',
            documentation: `Generated via ${languageModel.id}`,
            kind: monaco.languages.CompletionItemKind.Text,
            insertText: completionText,
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
        };
        suggestions.push(completionItem);
        return { suggestions };

    };
    id: string = 'code-completion-agent';
    name: string = 'Code Completion Agent';
    description: string = 'This agent provides code completions for a given code snippet.';
    promptTemplates: PromptTemplate[] = [
        {
            id: 'code-completion-prompt',
            template: `
            You are a code completion agent. The current file you have to complete is named \${file}.
            The language of the file is \${language}. Return your result as plain text without markdown formatting.
            Finish the following code snippet.

            \${snippet}

            Only return the exact replacement for {{MARKER}} to complete the snippet.
            `,
        }
    ];
    languageModelRequirements: Omit<LanguageModelSelector, 'agent'>[] = [{
        purpose: 'code-completion',
        identifier: 'openai/gpt-4o'
    }];
}
