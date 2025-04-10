// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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
    Agent,
    CommunicationRecordingService,
    CommunicationRequestEntryParam,
    getTextOfResponse,
    LanguageModelRegistry,
    LanguageModelRequirement,
    PromptService,
    PromptTemplate,
    UserRequest
} from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatSession } from './chat-service';
import { generateUuid } from '@theia/core';

const CHAT_SESSION_SUMMARY_PROMPT = {
    id: 'chat-session-summary-prompt',
    template: '{{!-- Made improvements or adaptations to this prompt template? We\'d love for you to share it with the community! Contribute back here: ' +
        'https://github.com/eclipse-theia/theia/discussions/new?category=prompt-template-contribution --}}\n\n' +
        'You are a chat agent for summarizing AI agent chat sessions for later use. \
Review the conversation below and generate a concise summary that captures every crucial detail, \
including all requirements, decisions, and pending tasks. \
Ensure that the summary is sufficiently comprehensive to allow seamless continuation of the workflow. The summary will primarily be used by other AI agents, so tailor your \
response for use by AI agents. \
\
Conversation:\n{{conversation}}',
};

@injectable()
export class ChatSessionSummaryAgent implements Agent {
    static ID = 'chat-session-summary-agent';
    id = ChatSessionSummaryAgent.ID;
    name = 'Chat Session Summary';
    description = 'Agent for generating chat session summaries.';
    variables = [];
    promptTemplates: PromptTemplate[] = [CHAT_SESSION_SUMMARY_PROMPT];
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'chat-session-summary',
        identifier: 'openai/gpt-4o-mini',
    }];
    agentSpecificVariables = [
        { name: 'conversation', usedInPrompt: true, description: 'The content of the chat conversation.' },
    ];
    functions = [];

    @inject(LanguageModelRegistry)
    protected readonly lmRegistry: LanguageModelRegistry;

    @inject(CommunicationRecordingService)
    protected recordingService: CommunicationRecordingService;

    @inject(PromptService)
    protected promptService: PromptService;

    async generateChatSessionSummary(chatSession: ChatSession): Promise<string> {
        const lm = await this.lmRegistry.selectLanguageModel({ agent: this.id, ...this.languageModelRequirements[0] });
        if (!lm) {
            throw new Error('No language model found for chat session summary.');
        }
        if (chatSession.model.getRequests().length < 1) {
            throw new Error('No chat request available to generate chat session summary.');
        }

        const conversation = chatSession.model.getRequests()
            .map(req => `<user>${req.request.text}</user>` +
                (req.response.response ? `<assistant>${req.response.response.asString()}</assistant>` : ''))
            .join('\n\n');

        const prompt = await this.promptService.getPrompt(CHAT_SESSION_SUMMARY_PROMPT.id, { conversation });
        const message = prompt?.text;
        if (!message) {
            throw new Error('Unable to create prompt message for generating chat session summary.');
        }

        const sessionId = generateUuid();
        const requestId = generateUuid();
        const request = {
            messages: [{
                actor: 'user',
                text: message,
                type: 'text'
            }],
            sessionId,
            requestId,
            agentId: this.id
        } satisfies UserRequest;

        this.recordingService.recordRequest({ ...request, request: request.messages } satisfies CommunicationRequestEntryParam);

        const result = await lm.request(request);
        const response = await getTextOfResponse(result);
        this.recordingService.recordResponse({
            agentId: this.id,
            sessionId,
            requestId,
            response: [{ actor: 'ai', text: response, type: 'text' }]
        });

        return response;
    }

}
