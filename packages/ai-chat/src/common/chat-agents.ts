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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Partially copied from https://github.com/microsoft/vscode/blob/a2cab7255c0df424027be05d58e1b7b941f4ea60/src/vs/workbench/contrib/chat/common/chatAgents.ts

import { CommunicationRecordingService, LanguageModel, LanguageModelResponse, LanguageModelRequirement } from '@theia/ai-core';
import {
    Agent,
    isLanguageModelStreamResponse,
    isLanguageModelTextResponse,
    LanguageModelRegistry, LanguageModelStreamResponsePart,
    PromptTemplate
} from '@theia/ai-core/lib/common';
import { TODAY_VARIABLE } from '@theia/ai-core/lib/today-variable-contribution';
import { generateUuid, ILogger, isArray, MaybePromise } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatModel, ChatRequestModelImpl, ChatResponseContent, CodeChatResponseContentImpl, MarkdownChatResponseContentImpl } from './chat-model';
import { ChatMessage } from './chat-util';

export enum ChatAgentLocation {
    Panel = 'panel',
    Terminal = 'terminal',
    Notebook = 'notebook',
    Editor = 'editor'
}

export namespace ChatAgentLocation {
    export const ALL: ChatAgentLocation[] = [ChatAgentLocation.Panel, ChatAgentLocation.Terminal, ChatAgentLocation.Notebook, ChatAgentLocation.Editor];

    export function fromRaw(value: string): ChatAgentLocation {
        switch (value) {
            case 'panel': return ChatAgentLocation.Panel;
            case 'terminal': return ChatAgentLocation.Terminal;
            case 'notebook': return ChatAgentLocation.Notebook;
            case 'editor': return ChatAgentLocation.Editor;
        }
        return ChatAgentLocation.Panel;
    }
}

export interface ChatAgentData extends Agent {
    locations: ChatAgentLocation[];
    iconClass?: string;
}

export const ChatAgent = Symbol('ChatAgent');
export interface ChatAgent extends ChatAgentData {
    invoke(request: ChatRequestModelImpl): Promise<void>;
}
@injectable()
export class DefaultChatAgent implements ChatAgent {
    @inject(LanguageModelRegistry)
    protected languageModelRegistry: LanguageModelRegistry;

    @inject(ILogger)
    protected logger: ILogger;

    @inject(CommunicationRecordingService)
    protected recordingService: CommunicationRecordingService;

    id: string = 'DefaultChatAgent';
    name: string = 'DefaultChatAgent';
    iconClass = 'codicon codicon-copilot';
    description: string = 'The default chat agent provided by Theia.';
    variables: string[] = [TODAY_VARIABLE.id];
    promptTemplates: PromptTemplate[] = [];
    // FIXME: placeholder values
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'chat',
        identifier: 'openai/gpt-4o',
    }, {
        purpose: 'general',
        identifier: 'openai/gpt-4',
    }];
    locations: ChatAgentLocation[] = ChatAgentLocation.ALL;

    async invoke(request: ChatRequestModelImpl): Promise<void> {
        const selector = this.languageModelRequirements.find(req => req.purpose === 'chat')!;
        const languageModels = await this.languageModelRegistry.selectLanguageModels({ agent: this.id, ...selector });
        if (languageModels.length === 0) {
            throw new Error('Couldn\'t find a language model. Please check your setup!');
        }
        const messages = await this.getMessages(request.session);
        this.recordingService.recordRequest({
            agentId: this.id,
            sessionId: request.session.id,
            timestamp: Date.now(),
            requestId: request.id,
            request: request.request.text,
            messages
        });

        const languageModelResponse = await this.callLlm(languageModels[0], messages);
        if (isLanguageModelTextResponse(languageModelResponse)) {
            request.response.response.addContent(
                new MarkdownChatResponseContentImpl(languageModelResponse.text)
            );
            request.response.complete();
            this.recordingService.recordResponse({
                agentId: this.id,
                sessionId: request.session.id,
                timestamp: Date.now(),
                requestId: request.response.requestId,
                response: request.response.response.asString()
            });
            return;
        }

        if (isLanguageModelStreamResponse(languageModelResponse)) {
            for await (const token of languageModelResponse.stream) {
                const newContents = this.parse(token, request.response.response.content);
                if (isArray(newContents)) {
                    newContents.forEach(request.response.response.addContent);
                } else {
                    request.response.response.addContent(newContents);
                }

                const lastContent = request.response.response.content.pop();
                if (lastContent === undefined) {
                    return;
                }
                const text = lastContent.asString?.();
                if (text === undefined) {
                    return;
                }
                let curSearchIndex = 0;
                const result: ChatResponseContent[] = [];
                while (curSearchIndex < text.length) {
                    // find start of code block: ```[language]\n<code>[\n]```
                    const codeStartIndex = text.indexOf('```', curSearchIndex);
                    if (codeStartIndex === -1) {
                        break;
                    }

                    // find language specifier if present
                    const newLineIndex = text.indexOf('\n', codeStartIndex + 3);
                    const language = codeStartIndex + 3 < newLineIndex ? text.substring(codeStartIndex + 3, newLineIndex) : undefined;

                    // find end of code block
                    const codeEndIndex = text.indexOf('```', codeStartIndex + 3);
                    if (codeEndIndex === -1) {
                        break;
                    }

                    // add text before code block as markdown content
                    result.push(new MarkdownChatResponseContentImpl(text.substring(curSearchIndex, codeStartIndex)));
                    // add code block as code content
                    const codeText = text.substring(newLineIndex + 1, codeEndIndex).trimEnd();
                    result.push(new CodeChatResponseContentImpl(codeText, language));
                    curSearchIndex = codeEndIndex + 3;
                }

                if (result.length > 0) {
                    result.forEach(r => {
                        request.response.response.addContent(r);
                    });
                } else {
                    request.response.response.addContent(lastContent);
                }
            }
            request.response.complete();
            this.recordingService.recordResponse({
                agentId: this.id,
                sessionId: request.session.id,
                timestamp: Date.now(),
                requestId: request.response.requestId,
                response: request.response.response.asString()
            });
            return;
        }
        this.logger.error(
            'Received unknown response in agent. Return response as text'
        );
        request.response.response.addContent(
            new MarkdownChatResponseContentImpl(
                JSON.stringify(languageModelResponse)
            )
        );
        request.response.complete();
        this.recordingService.recordResponse({
            agentId: this.id,
            sessionId: request.session.id,
            timestamp: Date.now(),
            requestId: request.response.requestId,
            response: request.response.response.asString()
        });
    }

    protected async callLlm(languageModel: LanguageModel, messages: ChatMessage[]): Promise<LanguageModelResponse> {
        const languageModelResponse = languageModel.request({ messages });
        return languageModelResponse;
    }

    protected getMessages(model: ChatModel, includeResponseInProgress = false, systemMessage?: string): MaybePromise<ChatMessage[]> {
        const requestMessages = model.getRequests().flatMap(request => {
            const messages: ChatMessage[] = [];
            const query = request.message.parts.map(part => part.promptText).join('');
            messages.push({
                actor: 'user',
                type: 'text',
                query,
            });
            if (request.response.isComplete || includeResponseInProgress) {
                messages.push({
                    actor: 'ai',
                    type: 'text',
                    query: request.response.response.asString(),
                });
            }
            return messages;
        });
        if (systemMessage) {
            const systemMsg: ChatMessage = {
                actor: 'system',
                type: 'text',
                query: systemMessage
            };
            // insert systemMsg at the beginning of requestMessages
            requestMessages.unshift(systemMsg);
        }
        return requestMessages;
    }

    private parse(token: LanguageModelStreamResponsePart, previousContent: ChatResponseContent[]): ChatResponseContent | ChatResponseContent[] {
        return new MarkdownChatResponseContentImpl(token.content ?? '');
    }
}

@injectable()
export class DummyChatAgent implements ChatAgent {

    @inject(CommunicationRecordingService)
    protected recordingService: CommunicationRecordingService;

    id: string = 'DummyChatAgent';
    name: string = 'DummyChatAgent';
    iconClass = 'codicon codicon-bug';
    description: string = 'The dummy chat agent provided by ES.';
    variables: string[] = [TODAY_VARIABLE.id];
    promptTemplates: PromptTemplate[] = [];
    languageModelRequirements: LanguageModelRequirement[] = [];
    locations: ChatAgentLocation[] = ChatAgentLocation.ALL;

    async invoke(request?: ChatRequestModelImpl): Promise<void> {
        const requestUuid = generateUuid();
        const sessionId = 'dummy-session';
        this.recordingService.recordRequest({
            agentId: this.id,
            sessionId: sessionId,
            timestamp: Date.now(),
            requestId: requestUuid,
            request: 'Dummy request'
        });
        this.recordingService.recordResponse({
            agentId: this.id,
            sessionId: sessionId,
            timestamp: Date.now(),
            requestId: requestUuid,
            response: 'Dummy response'
        });
    }
}
