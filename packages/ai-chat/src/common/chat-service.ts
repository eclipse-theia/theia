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
// Partially copied from https://github.com/microsoft/vscode/blob/a2cab7255c0df424027be05d58e1b7b941f4ea60/src/vs/workbench/contrib/chat/common/chatService.ts

import { inject, injectable, optional } from '@theia/core/shared/inversify';
import {
    ChatModel,
    ChatModelImpl,
    ChatRequest,
    ChatRequestModel,
    ChatResponseModel,
    ErrorChatResponseModelImpl,
} from './chat-model';
import { ChatAgentService } from './chat-agent-service';
import { Emitter, ILogger, generateUuid } from '@theia/core';
import { ChatRequestParser } from './chat-request-parser';
import { ChatAgent, ChatAgentLocation } from './chat-agents';
import { ParsedChatRequestAgentPart, ParsedChatRequestVariablePart, ParsedChatRequest } from './parsed-chat-request';
import { AIVariableService } from '@theia/ai-core';
import { Event } from '@theia/core/shared/vscode-languageserver-protocol';

export interface ChatRequestInvocation {
    /**
     * Promise which completes once the request preprocessing is complete.
     */
    requestCompleted: Promise<ChatRequestModel>;
    /**
     * Promise which completes once a response is expected to arrive.
     */
    responseCreated: Promise<ChatResponseModel>;
    /**
     * Promise which completes once the response is complete.
     */
    responseCompleted: Promise<ChatResponseModel>;
}

export interface ChatSession {
    id: string;
    title?: string;
    model: ChatModel;
    isActive: boolean;
}

export interface ActiveSessionChangedEvent {
    sessionId: string | undefined;
    focus?: boolean;
}

export interface SessionOptions {
    focus?: boolean;
}

export const DefaultChatAgentId = Symbol('DefaultChatAgentId');
export interface DefaultChatAgentId {
    id: string;
}

export const ChatService = Symbol('ChatService');
export interface ChatService {
    onActiveSessionChanged: Event<ActiveSessionChangedEvent>

    getSession(id: string): ChatSession | undefined;
    getSessions(): ChatSession[];
    createSession(location?: ChatAgentLocation, options?: SessionOptions): ChatSession;
    deleteSession(sessionId: string): void;
    setActiveSession(sessionId: string, options?: SessionOptions): void;

    sendRequest(
        sessionId: string,
        request: ChatRequest
    ): Promise<ChatRequestInvocation | undefined>;
}

interface ChatSessionInternal extends ChatSession {
    model: ChatModelImpl;
}

@injectable()
export class ChatServiceImpl implements ChatService {
    protected readonly onActiveSessionChangedEmitter = new Emitter<ActiveSessionChangedEvent>();
    onActiveSessionChanged = this.onActiveSessionChangedEmitter.event;

    @inject(ChatAgentService)
    protected chatAgentService: ChatAgentService;

    @inject(DefaultChatAgentId) @optional()
    protected defaultChatAgentId: DefaultChatAgentId | undefined;

    @inject(ChatRequestParser)
    protected chatRequestParser: ChatRequestParser;

    @inject(AIVariableService)
    protected variableService: AIVariableService;

    @inject(ILogger)
    protected logger: ILogger;

    protected _sessions: ChatSessionInternal[] = [];

    getSessions(): ChatSessionInternal[] {
        return [...this._sessions];
    }

    getSession(id: string): ChatSessionInternal | undefined {
        return this._sessions.find(session => session.id === id);
    }

    createSession(location = ChatAgentLocation.Panel, options?: SessionOptions): ChatSession {
        const model = new ChatModelImpl(location);
        const session: ChatSessionInternal = {
            id: model.id,
            model,
            isActive: true
        };
        this._sessions.push(session);
        this.setActiveSession(session.id, options);
        return session;
    }

    deleteSession(sessionId: string): void {
        // If the removed session is the active one, set the newest one as active
        if (this.getSession(sessionId)?.isActive) {
            this.setActiveSession(this._sessions[this._sessions.length - 1]?.id);
        }
        this._sessions = this._sessions.filter(item => item.id !== sessionId);
    }

    setActiveSession(sessionId: string | undefined, options?: SessionOptions): void {
        this._sessions.forEach(session => {
            session.isActive = session.id === sessionId;
        });
        this.onActiveSessionChangedEmitter.fire({ sessionId: sessionId, ...options });
    }

    async sendRequest(
        sessionId: string,
        request: ChatRequest
    ): Promise<ChatRequestInvocation | undefined> {
        const session = this.getSession(sessionId);
        if (!session) {
            return undefined;
        }
        session.title = request.text;

        const parsedRequest = this.chatRequestParser.parseChatRequest(request, session.model.location);

        const agent = this.getAgent(parsedRequest);
        if (agent === undefined) {
            const error = 'No ChatAgents available to handle request!';
            this.logger.error(error);
            const chatResponseModel = new ErrorChatResponseModelImpl(generateUuid(), new Error(error));
            return {
                requestCompleted: Promise.reject(error),
                responseCreated: Promise.reject(error),
                responseCompleted: Promise.resolve(chatResponseModel),
            };
        }
        const requestModel = session.model.addRequest(parsedRequest, agent?.id);

        for (const part of parsedRequest.parts) {
            if (part instanceof ParsedChatRequestVariablePart) {
                const resolvedVariable = await this.variableService.resolveVariable(
                    { variable: part.variableName, arg: part.variableArg },
                    { request, model: session }
                );
                if (resolvedVariable) {
                    part.resolution = resolvedVariable;
                } else {
                    this.logger.warn(`Failed to resolve variable ${part.variableName} for ${session.model.location}`);
                }
            }
        }

        let resolveResponseCreated: (responseModel: ChatResponseModel) => void;
        let resolveResponseCompleted: (responseModel: ChatResponseModel) => void;
        const invocation: ChatRequestInvocation = {
            requestCompleted: Promise.resolve(requestModel),
            responseCreated: new Promise(resolve => {
                resolveResponseCreated = resolve;
            }),
            responseCompleted: new Promise(resolve => {
                resolveResponseCompleted = resolve;
            }),
        };

        resolveResponseCreated!(requestModel.response);
        requestModel.response.onDidChange(() => {
            if (requestModel.response.isComplete) {
                resolveResponseCompleted!(requestModel.response);
            }
            if (requestModel.response.isError) {
                resolveResponseCompleted!(requestModel.response);
            }
        });

        if (agent) {
            agent.invoke(requestModel).catch(error => requestModel.response.error(error));
        } else {
            this.logger.error('No ChatAgents available to handle request!', requestModel);
        }

        return invocation;
    }

    protected getAgent(parsedRequest: ParsedChatRequest): ChatAgent | undefined {
        const agentPart = this.getMentionedAgent(parsedRequest);
        if (agentPart) {
            return this.chatAgentService.getAgent(agentPart.agentId);
        }
        if (this.defaultChatAgentId) {
            return this.chatAgentService.getAgent(this.defaultChatAgentId.id);
        }
        return this.chatAgentService.getAgents()[0] ?? undefined;
    }

    protected getMentionedAgent(parsedRequest: ParsedChatRequest): ParsedChatRequestAgentPart | undefined {
        return parsedRequest.parts.find(p => p instanceof ParsedChatRequestAgentPart) as ParsedChatRequestAgentPart | undefined;
    }
}
