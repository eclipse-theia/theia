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

import { inject, injectable } from '@theia/core/shared/inversify';
import {
    ChatModel,
    ChatModelImpl,
    ChatRequest,
    ChatRequestModel,
    ChatResponseModel,
} from './chat-model';
import { ChatAgentService } from './chat-agent-service';
import { Emitter, ILogger } from '@theia/core';
import { ChatRequestParser } from './chat-request-parser';
import { ChatAgent, ChatAgentLocation } from './chat-agents';
import { ChatRequestAgentPart, ChatRequestVariablePart, ParsedChatRequest } from './chat-parsed-request';
import { AIVariableService } from '@theia/ai-core';
import { Event } from '@theia/core/shared/vscode-languageserver-protocol';

export interface ChatSendRequestData {
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
    sessionId: string;
    focus?: boolean;
}

export interface SessionOptions {
    focus?: boolean;
}

export const ChatService = Symbol('ChatService');
export interface ChatService {
    onActiveSessionChanged: Event<ActiveSessionChangedEvent>

    getSession(id: string): ChatSession | undefined;
    getSessions(): ChatSession[];
    getOrRestoreSession(id: string): ChatSession | undefined;
    createSession(location?: ChatAgentLocation, options?: SessionOptions): ChatSession;
    removeSession(sessionId: string): void;
    setActiveSession(sessionId: string, options?: SessionOptions): void;

    sendRequest(
        sessionId: string,
        request: ChatRequest
    ): Promise<ChatSendRequestData | undefined>;
}

@injectable()
export class ChatServiceImpl implements ChatService {
    protected readonly onActiveSessionChangedEmitter = new Emitter<ActiveSessionChangedEvent>();
    onActiveSessionChanged = this.onActiveSessionChangedEmitter.event;

    @inject(ChatAgentService)
    protected chatAgentService: ChatAgentService;

    @inject(ChatRequestParser)
    protected chatRequestParser: ChatRequestParser;

    @inject(AIVariableService)
    protected variableService: AIVariableService;

    @inject(ILogger)
    protected logger: ILogger;

    protected _sessions: ChatSession[] = [];

    // TODO we might not want to expose this.
    getSessions(): ChatSession[] {
        return [...this._sessions];
    }

    getSession(id: string): ChatSession | undefined {
        return this._sessions.find(session => session.id === id);
    }

    getOrRestoreSession(id: string): ChatSession | undefined {
        // TODO: Implement storing and restoring sessions.
        return this._sessions.find(session => session.id === id);
    }

    createSession(location = ChatAgentLocation.Panel, options?: SessionOptions): ChatSession {
        const model = new ChatModelImpl(location);
        const session: ChatSession = {
            id: model.id,
            model,
            isActive: true
        };
        this._sessions.push(session);
        this.setActiveSession(session.id, options);
        return session;
    }

    removeSession(sessionId: string): void {
        // If the removed session is the active one, set the newest one as active
        if (this.getSession(sessionId)?.isActive) {
            this.setActiveSession(this._sessions[this._sessions.length - 1].id);
        }
        this._sessions = this._sessions.filter(item => item.id !== sessionId);
        if (this._sessions.length === 0) {
            this.createSession();
        }
    }

    getNextId(): string {
        let maxId = 0;
        this._sessions.forEach(session => {
            const id = parseInt(session.id);
            if (id > maxId) {
                maxId = id;
            }
        });
        return maxId.toString();
    }

    setActiveSession(sessionId: string, options?: SessionOptions): void {
        this._sessions.forEach(session => {
            session.isActive = session.id === sessionId;
        });
        this.onActiveSessionChangedEmitter.fire({ sessionId: sessionId, ...options });
    }

    async sendRequest(
        sessionId: string,
        request: ChatRequest
    ): Promise<ChatSendRequestData | undefined> {
        const session = this.getSession(sessionId);
        if (!session) {
            return undefined;
        }
        session.title = request.text;
        let resolveRequestCompleted: (requestModel: ChatRequestModel) => void;
        let resolveResponseCreated: (responseModel: ChatResponseModel) => void;
        let resolveResponseCompleted: (responseModel: ChatResponseModel) => void;
        const requestReturnData: ChatSendRequestData = {
            requestCompleted: new Promise(resolve => {
                resolveRequestCompleted = resolve;
            }),
            responseCreated: new Promise(resolve => {
                resolveResponseCreated = resolve;
            }),
            responseCompleted: new Promise(resolve => {
                resolveResponseCompleted = resolve;
            }),
        };
        const parsedRequest = this.chatRequestParser.parseChatRequest(request, session.model.location);

        const agent = this.getAgent(parsedRequest);
        const requestModel = session.model.addRequest(parsedRequest, agent?.id);

        for (const part of parsedRequest.parts) {
            if (part instanceof ChatRequestVariablePart) {
                // resolve variable
                const resolvedVariable = await this.variableService.resolveVariable(
                    { variable: part.variableName, arg: part.variableArg },
                    { request, model: session }
                );
                if (resolvedVariable) {
                    part.resolve(resolvedVariable);
                } else {
                    this.logger.warn(`Failed to resolve variable ${part.variableName} for ${session.model.location}`);
                }
            }
        }
        resolveRequestCompleted!(requestModel);

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
            this.chatAgentService
                .invokeAgent(agent.id, requestModel)
                .catch(error => requestModel.response.error(error));
        } else {
            this.logger.error('No ChatAgents available to handle request!', requestModel);
        }

        return requestReturnData;
    }

    protected getAgent(parsedRequest: ParsedChatRequest): ChatAgent | undefined {
        const agentPart = parsedRequest.parts.find(p => p instanceof ChatRequestAgentPart) as ChatRequestAgentPart | undefined;
        if (agentPart) {
            return this.chatAgentService.getAgent(agentPart.agent.id);
        }
        return this.chatAgentService.getAgents()[0] ?? undefined;
    }
}
