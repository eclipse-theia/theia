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

import {
    Agent,
    CommunicationRecordingService,
    getTextOfResponse,
    isLanguageModelStreamResponse,
    isLanguageModelTextResponse,
    LanguageModel,
    LanguageModelRegistry,
    LanguageModelRequirement,
    LanguageModelResponse,
    LanguageModelStreamResponsePart,
    MessageActor,
    PromptService,
    PromptTemplate,
    ToolRequest
} from '@theia/ai-core/lib/common';
import { TODAY_VARIABLE } from '@theia/ai-core/lib/common/today-variable-contribution';
import { CancellationToken, CancellationTokenSource, ILogger, isArray } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    ChatModel,
    ChatRequestModelImpl,
    ChatResponseContent,
    CodeChatResponseContentImpl,
    MarkdownChatResponseContentImpl,
    ToolCallResponseContentImpl
} from './chat-model';

export interface ChatMessage {
    actor: MessageActor;
    type: 'text';
    query: string;
}

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

const defaultTemplate: PromptTemplate = {
    id: 'default-template',
    template: 'You are an AI Assistant for software developers, running inside of Eclipse Theia'
};
@injectable()
export abstract class AbstractChatAgent implements ChatAgent {

    abstract locations: ChatAgentLocation[];
    abstract iconClass?: string | undefined;
    abstract id: string;
    abstract name: string;
    abstract description: string;
    abstract variables: string[];
    abstract promptTemplates: PromptTemplate[];
    abstract languageModelRequirements: LanguageModelRequirement[];

    @inject(LanguageModelRegistry)
    protected languageModelRegistry: LanguageModelRegistry;

    @inject(ILogger)
    protected logger: ILogger;

    @inject(CommunicationRecordingService)
    protected recordingService: CommunicationRecordingService;

    @inject(PromptService)
    protected promptService: PromptService;

    async invoke(request: ChatRequestModelImpl): Promise<void> {
        const selector = this.languageModelRequirements.find(req => req.purpose === 'chat')!;
        const languageModel = await this.languageModelRegistry.selectLanguageModel({ agent: this.id, ...selector });
        if (!languageModel) {
            throw new Error('Couldn\'t find a matching language model. Please check your setup!');
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
        const cancellationToken = new CancellationTokenSource();
        request.response.onDidChange(() => {
            if (request.response.isCanceled) {
                cancellationToken.cancel();
            }
        });
        const languageModelResponse = await this.callLlm(languageModel, messages, cancellationToken.token);
        await this.addContentsToResponse(languageModelResponse, request);
        request.response.complete();
        this.recordingService.recordResponse({
            agentId: this.id,
            sessionId: request.session.id,
            timestamp: Date.now(),
            requestId: request.response.requestId,
            response: request.response.response.asString()
        });
    }

    protected abstract getSystemMessage(): Promise<string | undefined>;

    protected async getMessages(model: ChatModel, includeResponseInProgress = false): Promise<ChatMessage[]> {
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
        const systemMessage = await this.getSystemMessage();
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

    /**
     * @returns the list of tools used by this agent, or undefined if none is needed.
     */
    protected getTools(): ToolRequest<object>[] | undefined {
        return undefined;
    }

    protected async callLlm(languageModel: LanguageModel, messages: ChatMessage[], token: CancellationToken): Promise<LanguageModelResponse> {
        const tools = this.getTools();
        const languageModelResponse = languageModel.request({ messages, tools, cancellationToken: token });
        return languageModelResponse;
    }

    protected abstract addContentsToResponse(languageModelResponse: LanguageModelResponse, request: ChatRequestModelImpl): Promise<void>;
}

@injectable()
export abstract class AbstractTextToModelParsingChatAgent<T> extends AbstractChatAgent {

    protected async addContentsToResponse(languageModelResponse: LanguageModelResponse, request: ChatRequestModelImpl): Promise<void> {
        const responseAsText = await getTextOfResponse(languageModelResponse);
        const parsedCommand = await this.parseTextResponse(responseAsText);
        const content = this.createResponseContent(parsedCommand, request);
        request.response.response.addContent(content);
    }

    protected abstract parseTextResponse(text: string): Promise<T>;

    protected abstract createResponseContent(parsedModel: T, request: ChatRequestModelImpl): ChatResponseContent;
}

@injectable()
export class DefaultChatAgent extends AbstractChatAgent {

    id: string = 'DefaultChatAgent';
    name: string = 'DefaultChatAgent';
    iconClass = 'codicon codicon-copilot';
    description: string = 'The default chat agent provided by Theia.';
    variables: string[] = [TODAY_VARIABLE.id];
    promptTemplates: PromptTemplate[] = [defaultTemplate];
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'chat',
        identifier: 'openai/gpt-4o',
    }, {
        purpose: 'general',
        identifier: 'openai/gpt-4',
    }];
    locations: ChatAgentLocation[] = ChatAgentLocation.ALL;

    protected override async addContentsToResponse(languageModelResponse: LanguageModelResponse, request: ChatRequestModelImpl): Promise<void> {
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
                    newContents.forEach(newContent => request.response.response.addContent(newContent));
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
    }

    protected async getSystemMessage(): Promise<string | undefined> {
        return this.promptService.getPrompt(defaultTemplate.id);
    }

    private parse(token: LanguageModelStreamResponsePart, previousContent: ChatResponseContent[]): ChatResponseContent | ChatResponseContent[] {
        const content = token.content;
        // eslint-disable-next-line no-null/no-null
        if (content !== undefined && content !== null) {
            return new MarkdownChatResponseContentImpl(content);
        }
        const toolCalls = token.tool_calls;
        if (toolCalls !== undefined) {
            const toolCallContents = toolCalls.map(toolCall =>
                new ToolCallResponseContentImpl(toolCall.id, toolCall.function?.name, toolCall.function?.arguments, toolCall.finished, toolCall.result));
            return toolCallContents;
        }
        return new MarkdownChatResponseContentImpl('');
    }
}
