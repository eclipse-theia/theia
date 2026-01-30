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

import { AIVariableResolutionRequest, AIVariableService, ResolvedAIContextVariable, ToolInvocationRegistry, ToolRequest } from '@theia/ai-core';
import { Emitter, Event, ILogger, URI, generateUuid } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { inject, injectable, optional } from '@theia/core/shared/inversify';
import { ChatAgentService, DefaultChatAgentId, FallbackChatAgentId } from './chat-agent-service';
import { ChatAgent, ChatAgentLocation, ChatSessionContext } from './chat-agents';
import {
    ChangeSetElement,
    ChangeSetImpl,
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
import { ChatSessionIndex, ChatSessionStore } from './chat-session-store';
import { ChatContentDeserializerRegistry } from './chat-content-deserializer';
import { ChangeSetDeserializationContext, ChangeSetElementDeserializerRegistry } from './change-set-element-deserializer';
import { SerializableChangeSetElement, SerializedChatModel, SerializableParsedRequest } from './chat-model-serialization';
import debounce = require('@theia/core/shared/lodash.debounce');

// Re-export for backward compatibility
export { DefaultChatAgentId, FallbackChatAgentId };

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

export interface SessionRenamedEvent {
    type: 'renamed';
    sessionId: string;
}

export interface SessionOptions {
    focus?: boolean;
}

export const PinChatAgent = Symbol('PinChatAgent');
export type PinChatAgent = boolean;

export const ChatService = Symbol('ChatService');
export const ChatServiceFactory = Symbol('ChatServiceFactory');
export interface ChatService {
    onSessionEvent: Event<ActiveSessionChangedEvent | SessionCreatedEvent | SessionDeletedEvent | SessionRenamedEvent>

    getSession(id: string): ChatSession | undefined;
    getSessions(): ChatSession[];
    createSession(location?: ChatAgentLocation, options?: SessionOptions, pinnedAgent?: ChatAgent): ChatSession;
    deleteSession(sessionId: string): Promise<void>;
    renameSession(sessionId: string, title: string): Promise<void>;
    getActiveSession(): ChatSession | undefined;
    setActiveSession(sessionId: string, options?: SessionOptions): void;

    sendRequest(
        sessionId: string,
        request: ChatRequest
    ): Promise<ChatRequestInvocation | undefined>;

    deleteChangeSet(sessionId: string): void;
    deleteChangeSetElement(sessionId: string, uri: URI): void;

    cancelRequest(sessionId: string, requestId: string): Promise<void>;

    getAgent(parsedRequest: ParsedChatRequest, session: ChatSession): ChatAgent | undefined;

    /**
     * Get an existing session or restore from storage
     */
    getOrRestoreSession(sessionId: string): Promise<ChatSession | undefined>;
    /**
     * Get all persisted session metadata.
     * Note: This may trigger storage initialization if not already initialized.
     */
    getPersistedSessions(): Promise<ChatSessionIndex>;
    /**
     * Check if there are persisted sessions available.
     */
    hasPersistedSessions(): Promise<boolean>;
}

interface ChatSessionInternal extends ChatSession {
    model: MutableChatModel;
}

@injectable()
export class ChatServiceImpl implements ChatService {
    protected readonly onSessionEventEmitter = new Emitter<ActiveSessionChangedEvent | SessionCreatedEvent | SessionDeletedEvent | SessionRenamedEvent>();
    onSessionEvent = this.onSessionEventEmitter.event;

    @inject(ChatAgentService)
    protected chatAgentService: ChatAgentService;

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

    @inject(ChatSessionStore) @optional()
    protected sessionStore: ChatSessionStore | undefined;

    @inject(ChatContentDeserializerRegistry)
    protected deserializerRegistry: ChatContentDeserializerRegistry;

    @inject(ChangeSetElementDeserializerRegistry)
    protected changeSetElementDeserializerRegistry: ChangeSetElementDeserializerRegistry;

    @inject(ToolInvocationRegistry)
    protected toolInvocationRegistry: ToolInvocationRegistry;

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
            lastInteraction: new Date(),
            model,
            isActive: true,
            pinnedAgent
        };
        this._sessions.push(session);
        this.setupAutoSaveForSession(session);
        this.setActiveSession(session.id, options);
        this.onSessionEventEmitter.fire({ type: 'created', sessionId: session.id });
        return session;
    }

    async deleteSession(sessionId: string): Promise<void> {
        const sessionIndex = this._sessions.findIndex(candidate => candidate.id === sessionId);

        // If session is in memory, remove it
        if (sessionIndex !== -1) {
            const session = this._sessions[sessionIndex];
            // If the removed session is the active one, set the newest one as active
            if (session.isActive) {
                this.setActiveSession(this._sessions[this._sessions.length - 1]?.id);
            }
            session.model.dispose();
            this._sessions.splice(sessionIndex, 1);
        }

        // Always delete from persistent storage first, then fire the event so that
        // listeners (e.g. the welcome screen) read an already-updated session index.
        if (this.sessionStore) {
            try {
                await this.sessionStore.deleteSession(sessionId);
            } catch (error) {
                this.logger.error('Failed to delete session from storage', { sessionId, error });
            }
        }

        this.onSessionEventEmitter.fire({ type: 'deleted', sessionId });
    }

    async renameSession(sessionId: string, title: string): Promise<void> {
        let session: ChatSession | undefined = this.getSession(sessionId);
        if (!session) {
            session = await this.getOrRestoreSession(sessionId);
        }
        if (!session) {
            this.logger.warn('Session not found for rename', { sessionId });
            return;
        }
        session.title = title;
        await this.saveSession(sessionId);
        this.onSessionEventEmitter.fire({ type: 'renamed', sessionId });
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

        this.cancelIncompleteRequests(session);

        const resolutionContext: ChatSessionContext = {
            model: session.model,
            capabilityOverrides: request.capabilityOverrides
        };
        const resolvedContext = await this.resolveChatContext(request.variables ?? session.model.context.getVariables(), resolutionContext);
        const parsedRequest = await this.chatRequestParser.parseChatRequest(request, session.model.location, resolvedContext);
        const agent = this.getAgent(parsedRequest, session);
        session.pinnedAgent = agent;

        if (agent === undefined) {
            const error = 'No agent was found to handle this request. ' +
                'Please ensure you have configured a default agent in the preferences and that the agent is enabled in the AI Configuration view. ' +
                'Alternatively, mention a specific agent with @AgentName.';
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

    protected cancelIncompleteRequests(session: ChatSessionInternal): void {
        for (const pastRequest of session.model.getRequests()) {
            if (!pastRequest.response.isComplete) {
                pastRequest.cancel();
            }
        }
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
                            // Trigger persistence when title changes
                            this.saveSession(session.id);
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

    getAgent(parsedRequest: ParsedChatRequest, session: ChatSession): ChatAgent | undefined {
        const agent = this.initialAgentSelection(parsedRequest);
        if (!this.isPinChatAgentEnabled()) {
            return agent;
        }

        return this.getPinnedAgent(parsedRequest, session, agent);
    }

    /**
     * Determines if chat agent pinning is enabled.
     * Can be overridden by subclasses to provide different logic (e.g., using preferences).
     */
    protected isPinChatAgentEnabled(): boolean {
        return this.pinChatAgent !== false;
    }

    /**
     * Check if an agent is pinned, and use it if no other agent is mentioned.
     */
    protected getPinnedAgent(parsedRequest: ParsedChatRequest, session: ChatSession, agent: ChatAgent | undefined): ChatAgent | undefined {
        const mentionedAgentPart = this.getMentionedAgent(parsedRequest);
        const mentionedAgent = mentionedAgentPart ? this.chatAgentService.getAgent(mentionedAgentPart.agentId) : undefined;
        if (mentionedAgent) {
            return mentionedAgent;
        } else if (session.pinnedAgent) {
            // If we have a valid pinned agent, use it (pinned agent may become stale
            // if it was disabled; so we always need to recheck)
            const pinnedAgent = this.chatAgentService.getAgent(session.pinnedAgent.id);
            if (pinnedAgent) {
                return pinnedAgent;
            }
        }
        return agent;
    }

    protected initialAgentSelection(parsedRequest: ParsedChatRequest): ChatAgent | undefined {
        return this.chatAgentService.resolveAgent(parsedRequest);
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

    protected saveSession(sessionId: string): Promise<void> {
        if (!this.sessionStore) {
            this.logger.debug('Session store not available, skipping save');
            return Promise.resolve();
        }

        const session = this.getSession(sessionId);
        if (!session) {
            this.logger.debug('Session not found, skipping save', { sessionId });
            return Promise.resolve();
        }

        // Don't save empty sessions
        if (session.model.isEmpty()) {
            this.logger.debug('Session is empty, skipping save', { sessionId });
            return Promise.resolve();
        }

        // Store session with title and pinned agent info
        return this.sessionStore.storeSessions(
            { model: session.model, title: session.title, pinnedAgentId: session.pinnedAgent?.id }
        ).catch(error => {
            this.logger.error('Failed to store chat sessions', error);
        });
    }

    /**
     * Set up auto-save for a session by listening to model changes.
     */
    protected setupAutoSaveForSession(session: ChatSessionInternal): void {
        const debouncedSave = debounce(() => this.saveSession(session.id), 500, { maxWait: 5000 });
        session.model.onDidChange(_event => {
            debouncedSave();
        });
    }

    async getOrRestoreSession(sessionId: string): Promise<ChatSession | undefined> {
        const existing = this.getSession(sessionId);
        if (existing) {
            this.logger.debug('Session already loaded', { sessionId });
            return existing;
        }

        if (!this.sessionStore) {
            this.logger.debug('Session store not available, cannot restore', { sessionId });
            return undefined;
        }

        this.logger.debug('Restoring session from storage', { sessionId });

        const serialized = await this.sessionStore.readSession(sessionId);
        if (!serialized) {
            this.logger.warn('Session not found in storage', { sessionId });
            return undefined;
        }

        this.logger.debug('Session loaded from storage', {
            sessionId,
            requestCount: serialized.model.requests.length,
            responseCount: serialized.model.responses.length,
            version: serialized.version
        });

        const model = new MutableChatModel(serialized.model);
        await this.restoreSessionData(model, serialized.model);

        // Determine pinned agent
        const pinnedAgent = serialized.pinnedAgentId
            ? this.chatAgentService.getAgent(serialized.pinnedAgentId)
            : undefined;

        // Register as session
        const session: ChatSessionInternal = {
            id: sessionId,
            title: serialized.title,
            lastInteraction: new Date(serialized.saveDate),
            model,
            isActive: false,
            pinnedAgent
        };
        this._sessions.push(session);
        this.setupAutoSaveForSession(session);
        this.onSessionEventEmitter.fire({ type: 'created', sessionId: session.id });

        this.logger.debug('Session successfully restored and registered', { sessionId, title: session.title });

        return session;
    }

    async getPersistedSessions(): Promise<ChatSessionIndex> {
        if (!this.sessionStore) {
            return {};
        }
        return this.sessionStore.getSessionIndex();
    }

    async hasPersistedSessions(): Promise<boolean> {
        if (!this.sessionStore) {
            return false;
        }
        return this.sessionStore.hasPersistedSessions();
    }

    /**
     * Deserialize response content and restore changesets.
     * Called after basic chat model structure was created.
     */
    protected async restoreSessionData(model: MutableChatModel, data: SerializedChatModel): Promise<void> {
        this.logger.debug('Restoring dynamic session data', { sessionId: data.sessionId, requestCount: data.requests.length });

        // Process each request for response content and changeset restoration
        // IMPORTANT: Use getAllRequests() to include alternatives, not just active requests
        const requests = model.getAllRequests();
        for (let i = 0; i < requests.length; i++) {
            const requestModel = requests[i];

            this.logger.debug('Restore request content', { requestId: requestModel.id, index: i });
            const reqData = data.requests.find(r => r.id === requestModel.id);
            if (reqData?.parsedRequest) {
                const toolRequests = this.restoreToolRequests(reqData.parsedRequest);
                requestModel.restoreToolRequests(toolRequests);
                this.logger.debug('Restored tool requests', { requestId: requestModel.id, toolRequests: Array.from(toolRequests.keys()) });
            }

            this.logger.debug('Restore response content', { requestId: requestModel.id, index: i });

            // Restore response content using deserializer registry
            const respData = data.responses.find(r => r.requestId === requestModel.id);
            if (respData && respData.content.length > 0) {
                const restoredContent = await Promise.all(respData.content.map(contentData =>
                    this.deserializerRegistry.deserialize(contentData)
                ));
                restoredContent.forEach(content => requestModel.response.response.addContent(content));
                this.logger.debug('Restored response content', {
                    requestId: requestModel.id,
                    contentCount: restoredContent.length
                });
            }

            // Restore changeset elements
            const serializedChangeSet = data.requests.find(r => r.id === requestModel.id)?.changeSet;
            if (serializedChangeSet && serializedChangeSet.elements && serializedChangeSet.elements.length > 0) {
                // Create a changeset if one doesn't exist
                if (!requestModel.changeSet) {
                    requestModel.changeSet = new ChangeSetImpl();
                }
                await this.restoreChangeSetElements(requestModel, serializedChangeSet.elements, data.sessionId);

                // Restore changeset title
                if (serializedChangeSet.title) {
                    requestModel.changeSet.setTitle(serializedChangeSet.title);
                }

                this.logger.debug('Restored changeset', {
                    requestId: requestModel.id,
                    elementCount: serializedChangeSet.elements.length
                });
            }
        }

        this.logger.debug('Restoring dynamic session data complete', { sessionId: data.sessionId });
    }

    /**
     * Extracts and resolves tool requests from serialized data.
     * Looks up actual ToolRequest objects from the registry, or creates fallbacks if not found.
     */
    protected restoreToolRequests(data: SerializableParsedRequest): Map<string, ToolRequest> {
        const toolRequests = new Map<string, ToolRequest>();
        for (const toolData of data.toolRequests) {
            toolRequests.set(toolData.id, this.loadToolRequestOrFallback(toolData.id));
        }
        return toolRequests;
    }

    /**
     * Loads a tool request from the registry or creates a fallback if not found.
     */
    protected loadToolRequestOrFallback(toolId: string): ToolRequest {
        const actualTool = this.toolInvocationRegistry.getFunction(toolId);
        if (actualTool) {
            return actualTool;
        }
        this.logger.warn(`Could not restore tool request with id '${toolId}' because it was not found in the registry.`);
        return {
            id: toolId,
            name: toolId,
            parameters: { type: 'object' as const, properties: {} },
            handler: async () => {
                throw new Error('Tool request handler not available because tool could not be found.');
            }
        };
    }

    protected async restoreChangeSetElements(
        requestModel: MutableChatRequestModel,
        elements: SerializableChangeSetElement[],
        sessionId: string
    ): Promise<void> {
        this.logger.debug('Restoring changeset elements', { requestId: requestModel.id, elementCount: elements.length });

        const context: ChangeSetDeserializationContext = {
            chatSessionId: sessionId,
            requestId: requestModel.id
        };

        const restoredElements: ChangeSetElement[] = [];

        for (const elem of elements) {
            const restoredElement = await this.changeSetElementDeserializerRegistry.deserialize(elem, context);
            restoredElements.push(restoredElement);
        }

        // Add elements to the request's changeset
        if (requestModel.changeSet) {
            requestModel.changeSet.addElements(...restoredElements);
            this.logger.debug('Changeset elements restored', { requestId: requestModel.id, elementCount: restoredElements.length });
        } else {
            this.logger.warn('Request has no changeset, cannot restore elements', { requestId: requestModel.id });
        }
    }
}
