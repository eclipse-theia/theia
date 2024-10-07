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
    Agent, AgentSpecificVariables, CommunicationHistoryEntry, CommunicationRecordingService, getTextOfResponse,
    LanguageModelRegistry, LanguageModelRequest, LanguageModelRequirement, PromptService, PromptTemplate
} from '@theia/ai-core/lib/common';
import { generateUuid, ILogger } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import * as monaco from '@theia/monaco-editor-core';

export const CodeCompletionAgent = Symbol('CodeCompletionAgent');
export interface CodeCompletionAgent extends Agent {
    provideInlineCompletions(model: monaco.editor.ITextModel, position: monaco.Position,
        context: monaco.languages.InlineCompletionContext, token: monaco.CancellationToken): Promise<monaco.languages.InlineCompletions | undefined>
}

@injectable()
export class CodeCompletionAgentImpl implements CodeCompletionAgent {
    async provideInlineCompletions(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        context: monaco.languages.InlineCompletionContext,
        token: monaco.CancellationToken
    ): Promise<monaco.languages.InlineCompletions | undefined> {
        const languageModel =
            await this.languageModelRegistry.selectLanguageModel({
                agent: this.id,
                ...this.languageModelRequirements[0],
            });
        if (!languageModel) {
            this.logger.error(
                'No language model found for code-completion-agent'
            );
            return undefined;
        }

        // Get text until the given position
        const textUntilCurrentPosition = model.getValueInRange({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
        });

        // Get text after the given position
        const textAfterCurrentPosition = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: model.getLineCount(),
            endColumn: model.getLineMaxColumn(model.getLineCount()),
        });

        const file = model.uri.toString(false);
        const language = model.getLanguageId();

        if (token.isCancellationRequested) {
            return undefined;
        }
        const prompt = await this.promptService
            .getPrompt('code-completion-prompt', { textUntilCurrentPosition, textAfterCurrentPosition, file, language })
            .then(p => p?.text);
        if (!prompt) {
            this.logger.error('No prompt found for code-completion-agent');
            return undefined;
        }

        // since we do not actually hold complete conversions, the request/response pair is considered a session
        const sessionId = generateUuid();
        const requestId = generateUuid();
        const request: LanguageModelRequest = {
            messages: [{ type: 'text', actor: 'user', query: prompt }],
        };
        const requestEntry: CommunicationHistoryEntry = {
            agentId: this.id,
            sessionId,
            timestamp: Date.now(),
            requestId,
            request: prompt,
        };
        if (token.isCancellationRequested) {
            return undefined;
        }
        this.recordingService.recordRequest(requestEntry);
        const response = await languageModel.request(request, token);
        if (token.isCancellationRequested) {
            return undefined;
        }
        const completionText = await getTextOfResponse(response);
        if (token.isCancellationRequested) {
            return undefined;
        }
        this.recordingService.recordResponse({
            agentId: this.id,
            sessionId,
            timestamp: Date.now(),
            requestId,
            response: completionText,
        });

        return {
            items: [{ insertText: completionText }],
            enableForwardStability: true,
        };
    }

    @inject(ILogger)
    @named('code-completion-agent')
    protected logger: ILogger;

    @inject(LanguageModelRegistry)
    protected languageModelRegistry: LanguageModelRegistry;

    @inject(PromptService)
    protected promptService: PromptService;

    @inject(CommunicationRecordingService)
    protected recordingService: CommunicationRecordingService;

    id = 'Code Completion';
    name = 'Code Completion';
    description =
        'This agent provides inline code completion in the code editor in the Theia IDE.';
    promptTemplates: PromptTemplate[] = [
        {
            id: 'code-completion-prompt',
            template: `You are a code completion agent. The current file you have to complete is named {{file}}.
The language of the file is {{language}}. Return your result as plain text without markdown formatting.
Finish the following code snippet.

{{textUntilCurrentPosition}}[[MARKER]]{{textAfterCurrentPosition}}

Only return the exact replacement for [[MARKER]] to complete the snippet.`,
        },
    ];
    languageModelRequirements: LanguageModelRequirement[] = [
        {
            purpose: 'code-completion',
            identifier: 'openai/gpt-4o',
        },
    ];
    readonly variables: string[] = [];
    readonly functions: string[] = [];
    readonly agentSpecificVariables: AgentSpecificVariables[] = [
        { name: 'file', usedInPrompt: true, description: 'The uri of the file being edited.' },
        { name: 'language', usedInPrompt: true, description: 'The languageId of the file being edited.' },
        { name: 'textUntilCurrentPosition', usedInPrompt: true, description: 'The code before the current position of the cursor.' },
        { name: 'textAfterCurrentPosition', usedInPrompt: true, description: 'The code after the current position of the cursor.' }
    ];
    readonly tags?: String[] | undefined;
}
