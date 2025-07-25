// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
    AgentService,
    getTextOfResponse,
    LanguageModelRegistry,
    LanguageModelRequirement,
    LanguageModelService,
    PromptService,
    UserRequest
} from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatSession } from './chat-service';
import { generateUuid } from '@theia/core';

import { CHAT_SESSION_NAMING_PROMPT } from './chat-session-naming-prompt-template';

@injectable()
export class ChatSessionNamingService {
    @inject(AgentService) protected agentService: AgentService;
    async generateChatSessionName(chatSession: ChatSession, otherNames: string[]): Promise<string | undefined> {
        const chatSessionNamingAgent = this.agentService.getAgents().find(agent => ChatSessionNamingAgent.ID === agent.id);
        if (!(chatSessionNamingAgent instanceof ChatSessionNamingAgent)) {
            return undefined;
        }
        return chatSessionNamingAgent.generateChatSessionName(chatSession, otherNames);
    }
}

@injectable()
export class ChatSessionNamingAgent implements Agent {
    static ID = 'Chat Session Naming';
    id = ChatSessionNamingAgent.ID;
    name = ChatSessionNamingAgent.ID;
    description = 'Agent for generating chat session names';
    variables = [];
    prompts = [CHAT_SESSION_NAMING_PROMPT];
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'chat-session-naming',
        identifier: 'openai/gpt-4o-mini',
    }];
    agentSpecificVariables = [
        { name: 'conversation', usedInPrompt: true, description: 'The content of the chat conversation.' },
        { name: 'listOfSessionNames', usedInPrompt: true, description: 'The list of existing session names.' }
    ];
    functions = [];

    @inject(LanguageModelRegistry)
    protected readonly lmRegistry: LanguageModelRegistry;

    @inject(LanguageModelService)
    protected readonly languageModelService: LanguageModelService;

    @inject(PromptService)
    protected promptService: PromptService;

    async generateChatSessionName(chatSession: ChatSession, otherNames: string[]): Promise<string> {
        const lm = await this.lmRegistry.selectLanguageModel({ agent: this.id, ...this.languageModelRequirements[0] });
        if (!lm) {
            throw new Error('No language model found for chat session naming');
        }
        if (chatSession.model.getRequests().length < 1) {
            throw new Error('No chat request available to generate chat session name');
        }

        const conversation = chatSession.model.getRequests()
            .map(req => `<user>${req.message.parts.map(chunk => chunk.promptText).join('')}</user>` +
                (req.response.response ? `<assistant>${req.response.response.asString()}</assistant>` : ''))
            .join('\n\n');
        const listOfSessionNames = otherNames.map(name => name).join(', ');

        const prompt = await this.promptService.getResolvedPromptFragment(CHAT_SESSION_NAMING_PROMPT.id, { conversation, listOfSessionNames });
        const message = prompt?.text;
        if (!message) {
            throw new Error('Unable to create prompt message for generating chat session name');
        }

        const sessionId = generateUuid();
        const requestId = generateUuid();
        const request: UserRequest & { agentId: string } = {
            messages: [{
                actor: 'user',
                text: message,
                type: 'text'
            }],
            requestId,
            sessionId,
            agentId: this.id
        };
        const result = await this.languageModelService.sendRequest(lm, request);
        const response = await getTextOfResponse(result);

        return response.replace(/\s+/g, ' ').substring(0, 100);
    }
}
