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
    getSession(id: string): ChatModel | undefined;
    getOrRestoreSession(id: string): ChatModel | undefined;
    createSession(): ChatModel;

    sendRequest(
        sessionId: string,
        request: ChatRequest
    ): Promise<ChatSendRequestData | undefined>;
}

@injectable()
export class ChatServiceImpl implements ChatService {
    @inject(ChatAgentService)
    protected chatAgentService: ChatAgentService;

    @inject(ChatRequestParser)
    protected chatRequestParser: ChatRequestParser;

    @inject(ILogger)
    protected logger: ILogger;

    protected _sessions: ChatModelImpl[] = [];

    getSession(id: string): ChatModelImpl | undefined {
        return this._sessions.find(session => session.id === id);
    }

    getOrRestoreSession(id: string): ChatModel | undefined {
        // TODO: Implement storing and restoring sessions.
        return this._sessions.find(session => session.id === id);
    }

    createSession(): ChatModel {
        const model = new ChatModelImpl();
        this._sessions.push(model);
        return model;
    }

    async sendRequest(
        sessionId: string,
        request: ChatRequest
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
        const parsedRequest = this.chatRequestParser.parseChatRequest(request.text);
        const requestModel = session.addRequest(request, parsedRequest);
        // TODO perform requestPreprocessing like variable resolving and agent determination
        // should this also be done by an agent?
        resolveRequestCompleted!(requestModel);

        resolveResponseCreated!(requestModel.response);
        requestModel.response.onDidChange(() => {
            if (requestModel.response.isComplete) {
                resolveResponseCompleted!(requestModel.response);
            }
        });


        const chatAgents = this.chatAgentService.getAgents();
        if (chatAgents.length > 0) {
            // TODO collect the correct agent
            this.chatAgentService.invokeAgent(chatAgents[0].id, requestModel);
        } else {
            this.logger.error('No ChatAgents available to handle request!');
        }
        return requestReturnData;
    }
}
