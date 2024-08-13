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
    CommunicationRecordingService,
    getTextOfResponse,
    LanguageModel,
    LanguageModelRequirement,
    LanguageModelResponse,
    PromptService,
    ResolvedPromptTemplate,
    ToolRequest,
} from '@theia/ai-core';
import {
    Agent,
    isLanguageModelStreamResponse,
    isLanguageModelTextResponse,
    LanguageModelRegistry,
    LanguageModelStreamResponsePart,
    MessageActor,
} from '@theia/ai-core/lib/common';
import { CancellationToken, CancellationTokenSource, ILogger, isArray } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatAgentService } from './chat-agent-service';
import {
    ChatModel,
    ChatRequestModel,
    ChatRequestModelImpl,
    ChatResponseContent,
    CodeChatResponseContentImpl,
    ErrorChatResponseContentImpl,
    MarkdownChatResponseContentImpl,
    ToolCallChatResponseContentImpl
} from './chat-model';

/**
 * A conversation consists of a sequence of ChatMessages.
 * Each ChatMessage is either a user message, AI message or a system message.
 *
 * For now we only support text based messages.
 */
export interface ChatMessage {
    actor: MessageActor;
    type: 'text';
    query: string;
}

/**
 * System message content, enriched with function descriptions.
 */
export interface SystemMessageDescription {
    text: string;
    /** All functions references in the system message. */
    functionDescriptions?: Map<string, ToolRequest>;
}
export namespace SystemMessageDescription {
    export function fromResolvedPromptTemplate(resolvedPrompt: ResolvedPromptTemplate): SystemMessageDescription {
        return {
            text: resolvedPrompt.text,
            functionDescriptions: resolvedPrompt.functionDescriptions
        };
    }
}

/**
 * The location from where an chat agent may be invoked.
 * Based on the location, a different context may be available.
 */
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

export const ChatAgent = Symbol('ChatAgent');
/**
 * A chat agent is a specialized agent with a common interface for its invocation.
 */
export interface ChatAgent extends Agent {
    locations: ChatAgentLocation[];
    iconClass?: string;
    invoke(request: ChatRequestModelImpl, chatAgentService?: ChatAgentService): Promise<void>;
}

@injectable()
export abstract class AbstractChatAgent {
    @inject(LanguageModelRegistry) protected languageModelRegistry: LanguageModelRegistry;
    @inject(ILogger) protected logger: ILogger;
    @inject(CommunicationRecordingService) protected recordingService: CommunicationRecordingService;
    @inject(PromptService) protected promptService: PromptService;
    constructor(
        public id: string,
        public languageModelRequirements: LanguageModelRequirement[],
        protected defaultLanguageModelPurpose: string,
        public iconClass: string = 'codicon codicon-copilot',
        public locations: ChatAgentLocation[] = ChatAgentLocation.ALL) {
    }

    async invoke(request: ChatRequestModelImpl): Promise<void> {
        try {
            const languageModel = await this.getLanguageModel(this.defaultLanguageModelPurpose);
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

            const systemMessageDescription = await this.getSystemMessageDescription();
            const tools: Map<string, ToolRequest> = new Map();
            if (systemMessageDescription) {
                const systemMsg: ChatMessage = {
                    actor: 'system',
                    type: 'text',
                    query: systemMessageDescription.text
                };
                // insert system message at the beginning of the request messages
                messages.unshift(systemMsg);
                systemMessageDescription.functionDescriptions?.forEach((tool, id) => {
                    tools.set(id, tool);
                });
            }
            this.getTools(request)?.forEach(tool => tools.set(tool.id, tool));

            const cancellationToken = new CancellationTokenSource();
            request.response.onDidChange(() => {
                if (request.response.isCanceled) {
                    cancellationToken.cancel();
                }
            });

            const languageModelResponse = await this.callLlm(
                languageModel,
                messages,
                tools.size > 0 ? Array.from(tools.values()) : undefined,
                cancellationToken.token
            );
            await this.addContentsToResponse(languageModelResponse, request);
            request.response.complete();
            this.recordingService.recordResponse({
                agentId: this.id,
                sessionId: request.session.id,
                timestamp: Date.now(),
                requestId: request.response.requestId,
                response: request.response.response.asString()
            });
        } catch (e) {
            this.handleError(request, e);
        }
    }

    protected handleError(request: ChatRequestModelImpl, error: Error): void {
        request.response.response.addContent(new ErrorChatResponseContentImpl(error));
        request.response.error(error);
    }

    protected getLanguageModelSelector(languageModelPurpose: string): LanguageModelRequirement {
        return this.languageModelRequirements.find(req => req.purpose === languageModelPurpose)!;
    }

    protected async getLanguageModel(languageModelPurpose: string): Promise<LanguageModel> {
        return this.selectLanguageModel(this.getLanguageModelSelector(languageModelPurpose));
    }

    protected async selectLanguageModel(selector: LanguageModelRequirement): Promise<LanguageModel> {
        const languageModel = await this.languageModelRegistry.selectLanguageModel({ agent: this.id, ...selector });
        if (!languageModel) {
            throw new Error('Couldn\'t find a language model. Please check your setup!');
        }
        return languageModel;
    }

    protected abstract getSystemMessageDescription(): Promise<SystemMessageDescription | undefined>;

    protected async getMessages(
        model: ChatModel, includeResponseInProgress = false
    ): Promise<ChatMessage[]> {
        const requestMessages = model.getRequests().flatMap(request => {
            const messages: ChatMessage[] = [];
            const text = request.message.parts.map(part => part.promptText).join('');
            messages.push({
                actor: 'user',
                type: 'text',
                query: text,
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

        return requestMessages;
    }

    /**
     * @returns the list of tools used by this agent, or undefined if none is needed.
     */
    protected getTools(request: ChatRequestModel): ToolRequest[] | undefined {
        return request.message.toolRequests.size > 0
            ? [...request.message.toolRequests.values()]
            : undefined;
    }

    protected async callLlm(
        languageModel: LanguageModel,
        messages: ChatMessage[],
        tools: ToolRequest[] | undefined,
        token: CancellationToken
    ): Promise<LanguageModelResponse> {
        const languageModelResponse = languageModel.request({
            messages,
            tools,
        }, token);
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
export abstract class AbstractStreamParsingChatAgent extends AbstractChatAgent {

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

    private parse(token: LanguageModelStreamResponsePart, previousContent: ChatResponseContent[]): ChatResponseContent | ChatResponseContent[] {
        const content = token.content;
        // eslint-disable-next-line no-null/no-null
        if (content !== undefined && content !== null) {
            return new MarkdownChatResponseContentImpl(content);
        }
        const toolCalls = token.tool_calls;
        if (toolCalls !== undefined) {
            const toolCallContents = toolCalls.map(toolCall =>
                new ToolCallChatResponseContentImpl(toolCall.id, toolCall.function?.name, toolCall.function?.arguments, toolCall.finished, toolCall.result));
            return toolCallContents;
        }
        return new MarkdownChatResponseContentImpl('');
    }

}
