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

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { ChatServiceImpl } from './chat-service';
import { ChatSessionStore, ChatSessionIndex, ChatModelWithMetadata } from './chat-session-store';
import { ChatAgentService } from './chat-agent-service';
import { ChatRequestParser } from './chat-request-parser';
import { AIVariableService } from '@theia/ai-core';
import { ILogger } from '@theia/core';
import { ChatContentDeserializerRegistry, ChatContentDeserializerRegistryImpl, DefaultChatContentDeserializerContribution } from './chat-content-deserializer';
import { ChangeSetElementDeserializerRegistry, ChangeSetElementDeserializerRegistryImpl } from './change-set-element-deserializer';
import { ChatAgentLocation } from './chat-agents';
import { ChatModel } from './chat-model';
import { SerializedChatData } from './chat-model-serialization';

describe('ChatService Session Deletion', () => {
    let chatService: ChatServiceImpl;
    let sessionStore: MockChatSessionStore;
    let container: Container;

    class MockChatSessionStore implements ChatSessionStore {
        public deletedSessions: string[] = [];
        public storedSessions: Array<ChatModel | ChatModelWithMetadata> = [];

        async storeSessions(...sessions: Array<ChatModel | ChatModelWithMetadata>): Promise<void> {
            this.storedSessions = sessions;
        }

        async readSession(sessionId: string): Promise<SerializedChatData | undefined> {
            return undefined;
        }

        async deleteSession(sessionId: string): Promise<void> {
            this.deletedSessions.push(sessionId);
        }

        async clearAllSessions(): Promise<void> {
            this.deletedSessions = [];
            this.storedSessions = [];
        }

        async getSessionIndex(): Promise<ChatSessionIndex> {
            return {};
        }

        async setSessionTitle(sessionId: string, title: string): Promise<void> {
        }
    }

    class MockChatAgentService {
        getAgent(): undefined {
            return undefined;
        }
        getAgents(): never[] {
            return [];
        }
    }

    class MockChatRequestParser {
        parseChatRequest(): { parts: never[]; text: string } {
            return { parts: [], text: '' };
        }
    }

    class MockAIVariableService {
        resolveVariables(): Promise<unknown[]> {
            return Promise.resolve([]);
        }
    }

    class MockLogger {
        error(): void { }
        warn(): void { }
        info(): void { }
        debug(): void { }
    }

    beforeEach(() => {
        container = new Container();
        sessionStore = new MockChatSessionStore();

        container.bind(ChatSessionStore).toConstantValue(sessionStore);
        container.bind(ChatAgentService).toConstantValue(new MockChatAgentService() as unknown as ChatAgentService);
        container.bind(ChatRequestParser).toConstantValue(new MockChatRequestParser() as unknown as ChatRequestParser);
        container.bind(AIVariableService).toConstantValue(new MockAIVariableService() as unknown as AIVariableService);
        container.bind(ILogger).toConstantValue(new MockLogger() as unknown as ILogger);

        // Bind deserializer registries
        const contentRegistry = new ChatContentDeserializerRegistryImpl();
        new DefaultChatContentDeserializerContribution().registerDeserializers(contentRegistry);
        container.bind(ChatContentDeserializerRegistry).toConstantValue(contentRegistry);
        container.bind(ChangeSetElementDeserializerRegistry).toConstantValue(new ChangeSetElementDeserializerRegistryImpl());
        container.bind(ChatServiceImpl).toSelf().inSingletonScope();

        chatService = container.get(ChatServiceImpl);
    });

    describe('deleteSession', () => {
        it('should delete session from memory and persistent storage', async () => {
            // Create a session
            const session = chatService.createSession(ChatAgentLocation.Panel);
            expect(chatService.getSessions()).to.have.lengthOf(1);

            // Delete the session (now returns a Promise)
            await chatService.deleteSession(session.id);

            // Verify it's removed from memory
            expect(chatService.getSessions()).to.have.lengthOf(0);

            // Verify it's deleted from persistent storage
            expect(sessionStore.deletedSessions).to.include(session.id);
        });

        it('should emit SessionDeletedEvent when session is deleted', done => {
            // Create a session
            const session = chatService.createSession(ChatAgentLocation.Panel);

            // Listen for deletion event
            chatService.onSessionEvent(event => {
                if (event.type === 'deleted') {
                    expect(event.sessionId).to.equal(session.id);
                    done();
                }
            });

            // Delete the session
            chatService.deleteSession(session.id);
        });

        it('should handle deletion when session store is not available', async () => {
            // Create a new service without session store
            const containerWithoutStore = new Container();
            containerWithoutStore.bind(ChatAgentService).toConstantValue(new MockChatAgentService() as unknown as ChatAgentService);
            containerWithoutStore.bind(ChatRequestParser).toConstantValue(new MockChatRequestParser() as unknown as ChatRequestParser);
            containerWithoutStore.bind(AIVariableService).toConstantValue(new MockAIVariableService() as unknown as AIVariableService);
            containerWithoutStore.bind(ILogger).toConstantValue(new MockLogger() as unknown as ILogger);

            // Bind deserializer registries
            const contentRegistry = new ChatContentDeserializerRegistryImpl();
            new DefaultChatContentDeserializerContribution().registerDeserializers(contentRegistry);
            containerWithoutStore.bind(ChatContentDeserializerRegistry).toConstantValue(contentRegistry);
            containerWithoutStore.bind(ChangeSetElementDeserializerRegistry).toConstantValue(new ChangeSetElementDeserializerRegistryImpl());

            containerWithoutStore.bind(ChatServiceImpl).toSelf().inSingletonScope();

            const serviceWithoutStore = containerWithoutStore.get(ChatServiceImpl);

            // Create and delete a session - should not throw
            const session = serviceWithoutStore.createSession(ChatAgentLocation.Panel);
            await serviceWithoutStore.deleteSession(session.id);

            // Verify session is still removed from memory
            expect(serviceWithoutStore.getSessions()).to.have.lengthOf(0);
        });

        it('should attempt storage deletion even for non-existent in-memory sessions', async () => {
            const initialDeletedCount = sessionStore.deletedSessions.length;
            const nonExistentId = 'non-existent-id';

            // Try to delete non-existent session (could be a persisted-only session)
            await chatService.deleteSession(nonExistentId);

            // Verify storage deletion was attempted even though session not in memory
            expect(sessionStore.deletedSessions).to.include(nonExistentId);
            expect(sessionStore.deletedSessions).to.have.lengthOf(initialDeletedCount + 1);
        });

        it('should handle deleting active session', () => {
            // Create two sessions
            const session1 = chatService.createSession(ChatAgentLocation.Panel);
            const session2 = chatService.createSession(ChatAgentLocation.Panel);

            // Ensure session2 is active (it should be by default as the latest)
            expect(chatService.getActiveSession()?.id).to.equal(session2.id);

            // Delete session1 (not active)
            chatService.deleteSession(session1.id);

            // Verify session2 is still active
            const activeSession = chatService.getActiveSession();
            expect(activeSession).to.not.be.undefined;
            expect(activeSession?.id).to.equal(session2.id);
        });

        it('should handle storage deletion errors gracefully', async () => {
            // Create a session store that throws errors
            const errorStore = new MockChatSessionStore();
            errorStore.deleteSession = async () => {
                throw new Error('Storage error');
            };

            const errorContainer = new Container();
            errorContainer.bind(ChatSessionStore).toConstantValue(errorStore);
            errorContainer.bind(ChatAgentService).toConstantValue(new MockChatAgentService() as unknown as ChatAgentService);
            errorContainer.bind(ChatRequestParser).toConstantValue(new MockChatRequestParser() as unknown as ChatRequestParser);
            errorContainer.bind(AIVariableService).toConstantValue(new MockAIVariableService() as unknown as AIVariableService);
            errorContainer.bind(ILogger).toConstantValue(new MockLogger() as unknown as ILogger);

            // Bind deserializer registries
            const contentRegistry = new ChatContentDeserializerRegistryImpl();
            new DefaultChatContentDeserializerContribution().registerDeserializers(contentRegistry);
            errorContainer.bind(ChatContentDeserializerRegistry).toConstantValue(contentRegistry);
            errorContainer.bind(ChangeSetElementDeserializerRegistry).toConstantValue(new ChangeSetElementDeserializerRegistryImpl());

            errorContainer.bind(ChatServiceImpl).toSelf().inSingletonScope();

            const errorService = errorContainer.get(ChatServiceImpl);

            // Create and delete a session - should not throw even with storage error
            const session = errorService.createSession(ChatAgentLocation.Panel);
            await errorService.deleteSession(session.id);

            // Verify session is still removed from memory despite storage error
            expect(errorService.getSessions()).to.have.lengthOf(0);
        });

        it('should delete persisted-only sessions (not loaded in memory)', async () => {
            // This simulates deleting a session from the "Show Chats..." dialog
            // when the session is persisted but not currently loaded into memory
            const persistedSessionId = 'persisted-session-123';

            // Verify session is not in memory
            expect(chatService.getSessions().find(s => s.id === persistedSessionId)).to.be.undefined;

            // Delete the persisted-only session
            await chatService.deleteSession(persistedSessionId);

            // Verify it was still deleted from storage (even though not in memory)
            expect(sessionStore.deletedSessions).to.include(persistedSessionId);
        });

        it('should not fire SessionDeletedEvent for persisted-only sessions', async () => {
            // When deleting a persisted-only session (not in memory),
            // we shouldn't fire the event since no in-memory state changed
            const persistedSessionId = 'persisted-session-456';
            let eventFired = false;

            // Listen for deletion event
            chatService.onSessionEvent(event => {
                if (event.type === 'deleted' && event.sessionId === persistedSessionId) {
                    eventFired = true;
                }
            });

            // Delete the persisted-only session
            await chatService.deleteSession(persistedSessionId);

            // Event should not have been fired since session wasn't in memory
            expect(eventFired).to.be.false;
            // But storage deletion should still have happened
            expect(sessionStore.deletedSessions).to.include(persistedSessionId);
        });
    });
});
