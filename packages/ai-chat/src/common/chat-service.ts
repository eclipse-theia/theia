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

import { AIVariableResolutionRequest, AIVariableService, ResolvedAIContextVariable } from '@theia/ai-core';
import { Emitter, ILogger, URI, generateUuid } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { inject, injectable, optional } from '@theia/core/shared/inversify';
import { Event } from '@theia/core/shared/vscode-languageserver-protocol';
import { ChatAgentService } from './chat-agent-service';
import { ChatAgent, ChatAgentLocation, ChatSessionContext } from './chat-agents';
import {
    ChatContext,
    ChatModel,
    ChatRequest,
    ChatRequestModel,
    ChatResponseModel,
    ErrorChatResponseModel,
    MutableChatModel,
    MutableChatRequestModel,
} from './chat-model';
import { ChatRequestParser } from './chat-request-parser';
import { ChatSessionNamingService } from './chat-session-naming-service';
import { ParsedChatRequest, ParsedChatRequestAgentPart } from './parsed-chat-request';

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
    lastInteraction?: Date;
    model: ChatModel;
    isActive: boolean;
    pinnedAgent?: ChatAgent;
}

export interface ActiveSessionChangedEvent {
    type: 'activeChange';
    sessionId: string | undefined;
    focus?: boolean;
}

export function isActiveSessionChangedEvent(obj: unknown): obj is ActiveSessionChangedEvent {
    // eslint-disable-next-line no-null/no-null
    return typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'activeChange';
}

export interface SessionCreatedEvent {
    type: 'created';
    sessionId: string;
}

export function isSessionCreatedEvent(obj: unknown): obj is SessionCreatedEvent {
    // eslint-disable-next-line no-null/no-null
    return typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'created';
}

export interface SessionDeletedEvent {
    type: 'deleted';
    sessionId: string;
}

export function isSessionDeletedEvent(obj: unknown): obj is SessionDeletedEvent {
    // eslint-disable-next-line no-null/no-null
    return typeof obj === 'object' && obj !== null && 'type' in obj && obj.type === 'deleted';
}

export interface SessionOptions {
    focus?: boolean;
}

/**
 * The default chat agent to invoke
 */
export const DefaultChatAgentId = Symbol('DefaultChatAgentId');
export interface DefaultChatAgentId {
    id: string;
}

/**
 * In case no fitting chat agent is available, this one will be used (if it is itself available)
 */
export const FallbackChatAgentId = Symbol('FallbackChatAgentId');
export interface FallbackChatAgentId {
    id: string;
}

export const PinChatAgent = Symbol('PinChatAgent');
export type PinChatAgent = boolean;

export const ChatService = Symbol('ChatService');
export const ChatServiceFactory = Symbol('ChatServiceFactory');
export interface ChatService {
    onSessionEvent: Event<ActiveSessionChangedEvent | SessionCreatedEvent | SessionDeletedEvent>

    getSession(id: string): ChatSession | undefined;
    getSessions(): ChatSession[];
    createSession(location?: ChatAgentLocation, options?: SessionOptions, pinnedAgent?: ChatAgent): ChatSession;
    deleteSession(sessionId: string): void;
    getActiveSession(): ChatSession | undefined;
    setActiveSession(sessionId: string, options?: SessionOptions): void;

    sendRequest(
        sessionId: string,
        request: ChatRequest
    ): Promise<ChatRequestInvocation | undefined>;

    deleteChangeSet(sessionId: string): void;
    deleteChangeSetElement(sessionId: string, uri: URI): void;

    cancelRequest(sessionId: string, requestId: string): Promise<void>;
}

interface ChatSessionInternal extends ChatSession {
    model: MutableChatModel;
}

@injectable()
export class ChatServiceImpl implements ChatService {
    protected readonly onSessionEventEmitter = new Emitter<ActiveSessionChangedEvent | SessionCreatedEvent | SessionDeletedEvent>();
    onSessionEvent = this.onSessionEventEmitter.event;

    @inject(ChatAgentService)
    protected chatAgentService: ChatAgentService;

    @inject(DefaultChatAgentId) @optional()
    protected defaultChatAgentId: DefaultChatAgentId | undefined;

    @inject(FallbackChatAgentId) @optional()
    protected fallbackChatAgentId: FallbackChatAgentId | undefined;

    @inject(ChatSessionNamingService) @optional()
    protected chatSessionNamingService: ChatSessionNamingService | undefined;

    @inject(PinChatAgent) @optional()
    protected pinChatAgent: boolean | undefined;

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

    createSession(location = ChatAgentLocation.Panel, options?: SessionOptions, pinnedAgent?: ChatAgent): ChatSession {
        const model = new MutableChatModel(location);
        const session: ChatSessionInternal = {
            id: model.id,
            model,
            isActive: true,
            pinnedAgent
        };
        this._sessions.push(session);
        this.setActiveSession(session.id, options);
        this.onSessionEventEmitter.fire({ type: 'created', sessionId: session.id });
        return session;
    }

    deleteSession(sessionId: string): void {
        const sessionIndex = this._sessions.findIndex(candidate => candidate.id === sessionId);
        if (sessionIndex === -1) { return; }
        const session = this._sessions[sessionIndex];
        // If the removed session is the active one, set the newest one as active
        if (session.isActive) {
            this.setActiveSession(this._sessions[this._sessions.length - 1]?.id);
        }
        session.model.dispose();
        this._sessions.splice(sessionIndex, 1);
        this.onSessionEventEmitter.fire({ type: 'deleted', sessionId: sessionId });
    }

    getActiveSession(): ChatSession | undefined {
        const activeSessions = this._sessions.filter(candidate => candidate.isActive);
        if (activeSessions.length > 1) { throw new Error('More than one session marked as active. This indicates an error in ChatService.'); }
        return activeSessions.at(0);
    }

    setActiveSession(sessionId: string | undefined, options?: SessionOptions): void {
        this._sessions.forEach(session => {
            session.isActive = session.id === sessionId;
        });
        this.onSessionEventEmitter.fire({ type: 'activeChange', sessionId: sessionId, ...options });
    }

    async sendRequest(
        sessionId: string,
        request: ChatRequest,
    ): Promise<ChatRequestInvocation | undefined> {
        const session = this.getSession(sessionId);
        if (!session) {
            return undefined;
        }

        const resolutionContext: ChatSessionContext = { model: session.model };
        const resolvedContext = await this.resolveChatContext(request.variables ?? session.model.context.getVariables(), resolutionContext);
        const parsedRequest = await this.chatRequestParser.parseChatRequest(request, session.model.location, resolvedContext);
        const agent = this.getAgent(parsedRequest, session);

        if (agent === undefined) {
            const error = 'No ChatAgents available to handle request!';
            this.logger.error(error);
            const chatResponseModel = new ErrorChatResponseModel(generateUuid(), new Error(error));
            return {
                requestCompleted: Promise.reject(error),
                responseCreated: Promise.reject(error),
                responseCompleted: Promise.resolve(chatResponseModel),
            };
        }

        const requestModel = session.model.addRequest(parsedRequest, agent?.id, resolvedContext);
        this.updateSessionMetadata(session, requestModel);
        resolutionContext.request = requestModel;

        const responseCompletionDeferred = new Deferred<ChatResponseModel>();
        const invocation: ChatRequestInvocation = {
            requestCompleted: Promise.resolve(requestModel),
            responseCreated: Promise.resolve(requestModel.response),
            responseCompleted: responseCompletionDeferred.promise,
        };

        requestModel.response.onDidChange(() => {
            if (requestModel.response.isComplete) {
                responseCompletionDeferred.resolve(requestModel.response);
            }
            if (requestModel.response.isError) {
                responseCompletionDeferred.resolve(requestModel.response);
            }
        });

        agent.invoke(requestModel).catch(error => requestModel.response.error(error));

        return invocation;
    }

    protected updateSessionMetadata(session: ChatSessionInternal, request: MutableChatRequestModel): void {
        session.lastInteraction = new Date();
        if (session.title) {
            return;
        }
        const requestText = request.request.displayText ?? request.request.text;
        session.title = requestText;
        if (this.chatSessionNamingService) {
            const otherSessionNames = this._sessions.map(s => s.title).filter((title): title is string => title !== undefined);
            const namingService = this.chatSessionNamingService;
            let didGenerateName = false;
            request.response.onDidChange(() => {
                if (request.response.isComplete && !didGenerateName) {
                    namingService.generateChatSessionName(session, otherSessionNames).then(name => {
                        if (name && session.title === requestText) {
                            session.title = name;
                        }
                        didGenerateName = true;
                    }).catch(error => this.logger.error('Failed to generate chat session name', error));
                }
            });
        }
    }

    protected async resolveChatContext(
        resolutionRequests: readonly AIVariableResolutionRequest[],
        context: ChatSessionContext,
    ): Promise<ChatContext> {
        // TODO use a common cache to resolve variables and return recursively resolved variables?
        const resolvedVariables = await Promise.all(resolutionRequests.map(async contextVariable => this.variableService.resolveVariable(contextVariable, context)))
            .then(results => results.filter(ResolvedAIContextVariable.is));
        return { variables: resolvedVariables };
    }

    async cancelRequest(sessionId: string, requestId: string): Promise<void> {
        return this.getSession(sessionId)?.model.getRequest(requestId)?.response.cancel();
    }

    protected getAgent(parsedRequest: ParsedChatRequest, session: ChatSession): ChatAgent | undefined {
        const agent = this.initialAgentSelection(parsedRequest);
        if (!this.isPinChatAgentEnabled()) {
            return agent;
        }

        return this.handlePinnedAgent(parsedRequest, session, agent);
    }

    /**
     * Determines if chat agent pinning is enabled.
     * Can be overridden by subclasses to provide different logic (e.g., using preferences).
     */
    protected isPinChatAgentEnabled(): boolean {
        return this.pinChatAgent !== false;
    }

    /**
     * Handle pinned agent by:
     * - checking if an agent is pinned, and use it if no other agent is mentioned
     * - pinning the current agent
     */
    protected handlePinnedAgent(parsedRequest: ParsedChatRequest, session: ChatSession, agent: ChatAgent | undefined): ChatAgent | undefined {
        const mentionedAgentPart = this.getMentionedAgent(parsedRequest);
        const mentionedAgent = mentionedAgentPart ? this.chatAgentService.getAgent(mentionedAgentPart.agentId) : undefined;
        if (mentionedAgent) {
            // If an agent is explicitly mentioned, it becomes the new pinned agent
            session.pinnedAgent = mentionedAgent;
            return mentionedAgent;
        } else if (session.pinnedAgent) {
            // If we have a valid pinned agent, use it (pinned agent may become stale
            // if it was disabled; so we always need to recheck)
            const pinnedAgent = this.chatAgentService.getAgent(session.pinnedAgent.id);
            if (pinnedAgent) {
                return pinnedAgent;
            }
        }
        // Otherwise, override the pinned agent and return the suggested one
        session.pinnedAgent = agent;
        return agent;
    }

    protected initialAgentSelection(parsedRequest: ParsedChatRequest): ChatAgent | undefined {
        const agentPart = this.getMentionedAgent(parsedRequest);
        if (agentPart) {
            return this.chatAgentService.getAgent(agentPart.agentId);
        }
        let chatAgent = undefined;
        if (this.defaultChatAgentId) {
            chatAgent = this.chatAgentService.getAgent(this.defaultChatAgentId.id);
        }
        if (!chatAgent && this.fallbackChatAgentId) {
            chatAgent = this.chatAgentService.getAgent(this.fallbackChatAgentId.id);
        }
        if (chatAgent) {
            return chatAgent;
        }
        this.logger.warn('Neither the default chat agent nor the fallback chat agent are configured or available. Falling back to the first registered agent');
        return this.chatAgentService.getAgents()[0] ?? undefined;
    }

    protected getMentionedAgent(parsedRequest: ParsedChatRequest): ParsedChatRequestAgentPart | undefined {
        return parsedRequest.parts.find(p => p instanceof ParsedChatRequestAgentPart) as ParsedChatRequestAgentPart | undefined;
    }

    deleteChangeSet(sessionId: string): void {
        const model = this.getSession(sessionId)?.model;
        model?.changeSet.setElements();
    }

    deleteChangeSetElement(sessionId: string, uri: URI): void {
        this.getSession(sessionId)?.model.changeSet.removeElements(uri);
    }
}
