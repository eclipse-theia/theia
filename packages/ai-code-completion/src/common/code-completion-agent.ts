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

import {
    Agent, CommunicationHistoryEntry, CommunicationRecordingService, getTextOfResponse,
    LanguageModelRegistry, LanguageModelRequest, LanguageModelRequirement, PromptService, PromptTemplate
} from '@theia/ai-core/lib/common';
import { CancellationToken, generateUuid } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import * as monaco from '@theia/monaco-editor-core';

export const CodeCompletionAgent = Symbol('CodeCompletionAgent');
export interface CodeCompletionAgent extends Agent {
    provideCompletionItems(model: monaco.editor.ITextModel, position: monaco.Position,
        context: monaco.languages.CompletionContext, token: monaco.CancellationToken): Promise<monaco.languages.CompletionList | undefined>;
    provideInlineCompletions?(model: monaco.editor.ITextModel, position: monaco.Position,
        context: monaco.languages.InlineCompletionContext, token: monaco.CancellationToken): Promise<monaco.languages.InlineCompletions | undefined>
}

@injectable()
export class CodeCompletionAgentImpl implements CodeCompletionAgent {
    variables: string[] = [];

    @inject(LanguageModelRegistry)
    protected languageModelRegistry: LanguageModelRegistry;

    @inject(PromptService)
    protected promptService: PromptService;

    @inject(CommunicationRecordingService)
    protected recordingService: CommunicationRecordingService;

    async provideCompletionItems(model: monaco.editor.ITextModel, position: monaco.Position,
        context: monaco.languages.CompletionContext, token: CancellationToken): Promise<monaco.languages.CompletionList | undefined> {

        const languageModel = await this.languageModelRegistry.selectLanguageModel({
            agent: this.id,
            ...this.languageModelRequirements[0]
        });
        if (!languageModel) {
            console.error('No language model found for code-completion-agent');
            return undefined;
        }
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

        if (token.isCancellationRequested) {
            return undefined;
        }
        const prompt = await this.promptService.getPrompt('code-completion-prompt', { snippet, file, language });
        if (!prompt) {
            console.error('No prompt found for code-completion-agent');
            return undefined;
        }
        console.log('Code completion agent is using prompt:', prompt);

        // since we do not actually hold complete conversions, the request/response pair is considered a session
        const sessionId = generateUuid();
        const requestId = generateUuid();
        const request: LanguageModelRequest = { messages: [{ type: 'text', actor: 'user', query: prompt }], cancellationToken: token };
        const requestEntry: CommunicationHistoryEntry = {
            agentId: this.id,
            sessionId,
            timestamp: Date.now(),
            requestId,
            request: prompt
        };
        if (token.isCancellationRequested) {
            return undefined;
        }
        this.recordingService.recordRequest(requestEntry);
        const response = await languageModel.request(request);
        if (token.isCancellationRequested) {
            return undefined;
        }
        const completionText = await getTextOfResponse(response);
        if (token.isCancellationRequested) {
            return undefined;
        }
        console.log('Code completion suggests', completionText);
        this.recordingService.recordResponse({
            agentId: this.id,
            sessionId,
            timestamp: Date.now(),
            requestId,
            response: completionText
        });

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
            template: `You are a code completion agent. The current file you have to complete is named \${file}.
The language of the file is \${language}. Return your result as plain text without markdown formatting.
Finish the following code snippet.

\${snippet}

Only return the exact replacement for {{MARKER}} to complete the snippet.`,
        }
    ];
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'code-completion',
        identifier: 'openai/gpt-4o'
    }];
}
