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
import { ILogger } from '@theia/core';
import { ChatRequestParser } from './chat-request-parser';
import { ChatAgent, ChatAgentLocation } from './chat-agents';
import { ChatRequestAgentPart, ChatRequestVariablePart, ParsedChatRequest } from './chat-parsed-request';
import { AIVariableService } from '@theia/ai-core';

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

export const ChatService = Symbol('ChatService');
export interface ChatService {
    getSessions(): ChatModel[];
    getSession(id: string): ChatModel | undefined;
    getOrRestoreSession(id: string): ChatModel | undefined;
    createSession(location?: ChatAgentLocation): ChatModel;

    sendRequest(
        sessionId: string,
        request: ChatRequest,
        errorHandler?: (e: unknown) => void
    ): Promise<ChatSendRequestData | undefined>;
}

@injectable()
export class ChatServiceImpl implements ChatService {
    @inject(ChatAgentService)
    protected chatAgentService: ChatAgentService;

    @inject(ChatRequestParser)
    protected chatRequestParser: ChatRequestParser;

    @inject(AIVariableService)
    protected variableService: AIVariableService;

    @inject(ILogger)
    protected logger: ILogger;

    protected _sessions: ChatModelImpl[] = [];

    // TODO we might not want to expose this.
    getSessions(): ChatModel[] {
        return [...this._sessions];
    }

    getSession(id: string): ChatModelImpl | undefined {
        return this._sessions.find(session => session.id === id);
    }

    getOrRestoreSession(id: string): ChatModel | undefined {
        // TODO: Implement storing and restoring sessions.
        return this._sessions.find(session => session.id === id);
    }

    createSession(location = ChatAgentLocation.Panel): ChatModel {
        const model = new ChatModelImpl(location);
        this._sessions.push(model);
        return model;
    }

    async sendRequest(
        sessionId: string,
        request: ChatRequest,
        errorHandler?: (e: unknown) => void
    ): Promise<ChatSendRequestData | undefined> {
        const session = this.getSession(sessionId);
        if (!session) {
            return undefined;
        }
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
        const parsedRequest = this.chatRequestParser.parseChatRequest(request, session.location);

        const agent = this.getAgent(parsedRequest);
        const requestModel = session.addRequest(parsedRequest, agent?.id);

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
                    this.logger.warn(`Failed to resolve variable ${part.variableName} for ${session.location}`);
                }
            }
        }
        resolveRequestCompleted!(requestModel);

        resolveResponseCreated!(requestModel.response);
        requestModel.response.onDidChange(() => {
            if (requestModel.response.isComplete) {
                resolveResponseCompleted!(requestModel.response);
            }
        });

        if (agent) {
            this.chatAgentService.invokeAgent(agent.id, requestModel).catch(e => {
                if (errorHandler) {
                    errorHandler(e);
                } else {
                    throw e;
                }
            });
        } else {
            this.logger.error('No ChatAgents available to handle request!');
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
