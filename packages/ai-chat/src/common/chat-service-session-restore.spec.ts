// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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
import { AIVariableService, ToolInvocationRegistry } from '@theia/ai-core';
import { ILogger } from '@theia/core';
import { ChatContentDeserializerRegistry, ChatContentDeserializerRegistryImpl, DefaultChatContentDeserializerContribution } from './chat-content-deserializer';
import { ChangeSetElementDeserializerRegistry, ChangeSetElementDeserializerRegistryImpl } from './change-set-element-deserializer';
import { ChatAgentLocation } from './chat-agents';
import { ChatModel } from './chat-model';
import { SerializedChatData } from './chat-model-serialization';

describe('ChatService Session Restore', () => {

    class MockChatSessionStore implements ChatSessionStore {
        public readCount = 0;
        public readDelayMs = 50;
        public serialized?: SerializedChatData;
        public failReads = false;

        async storeSessions(...sessions: Array<ChatModel | ChatModelWithMetadata>): Promise<void> { }

        async readSession(sessionId: string): Promise<SerializedChatData | undefined> {
            this.readCount++;
            if (this.failReads) {
                throw new Error('storage unavailable');
            }
            // Simulate the load time of a large persisted session: this is the window in
            // which a second restore request for the same session can arrive.
            await new Promise(resolve => setTimeout(resolve, this.readDelayMs));
            return this.serialized;
        }

        async deleteSession(sessionId: string): Promise<void> { }

        async clearAllSessions(): Promise<void> { }

        async getSessionIndex(): Promise<ChatSessionIndex> {
            return {};
        }

        async hasPersistedSessions(): Promise<boolean> {
            return this.serialized !== undefined;
        }

        async setSessionTitle(sessionId: string, title: string): Promise<void> { }
    }

    class MockChatAgentService {
        readonly onDidChangeAgents = { dispose: () => { } };
        readonly onDefaultAgentChanged = { dispose: () => { } };

        getAgent(): undefined {
            return undefined;
        }
        getAgents(): never[] {
            return [];
        }
        resolveAgent(): undefined {
            return undefined;
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

    const mockToolInvocationRegistry: ToolInvocationRegistry = {
        registerTool: () => { },
        unregisterTool: () => { },
        getFunction: () => undefined,
        getFunctions: () => [],
        getAllFunctions: () => [],
        unregisterAllTools: () => { },
        onDidChange: () => ({ dispose: () => { } })
    };

    function createChatService(sessionStore: ChatSessionStore): ChatServiceImpl {
        const container = new Container();
        container.bind(ChatSessionStore).toConstantValue(sessionStore);
        container.bind(ChatAgentService).toConstantValue(new MockChatAgentService() as unknown as ChatAgentService);
        container.bind(ChatRequestParser).toConstantValue(new MockChatRequestParser() as unknown as ChatRequestParser);
        container.bind(AIVariableService).toConstantValue(new MockAIVariableService() as unknown as AIVariableService);
        container.bind(ILogger).toConstantValue(new MockLogger() as unknown as ILogger);
        container.bind(ToolInvocationRegistry).toConstantValue(mockToolInvocationRegistry);
        const contentRegistry = new ChatContentDeserializerRegistryImpl();
        new DefaultChatContentDeserializerContribution().registerDeserializers(contentRegistry);
        container.bind(ChatContentDeserializerRegistry).toConstantValue(contentRegistry);
        container.bind(ChangeSetElementDeserializerRegistry).toConstantValue(new ChangeSetElementDeserializerRegistryImpl());
        container.bind(ChatServiceImpl).toSelf().inSingletonScope();
        return container.get(ChatServiceImpl);
    }

    let store: MockChatSessionStore;
    let chatService: ChatServiceImpl;
    let restoredId: string;

    beforeEach(async () => {
        // Build valid serialized session data by serializing a real session.
        const sourceStore = new MockChatSessionStore();
        const sourceService = createChatService(sourceStore);
        const sourceSession = sourceService.createSession(ChatAgentLocation.Panel);
        await sourceService.sendRequest(sourceSession.id, { text: 'Test' });
        const serialized: SerializedChatData = {
            version: 1,
            model: sourceSession.model.toSerializable(),
            pinnedAgentId: undefined,
            saveDate: Date.now()
        };
        restoredId = sourceSession.id;

        store = new MockChatSessionStore();
        store.serialized = serialized;
        chatService = createChatService(store);
    });

    it('should register a session only once when restored concurrently', async () => {
        const [first, second] = await Promise.all([
            chatService.getOrRestoreSession(restoredId),
            chatService.getOrRestoreSession(restoredId)
        ]);

        expect(first).to.not.be.undefined;
        expect(second).to.equal(first);
        expect(chatService.getSessions().filter(s => s.id === restoredId)).to.have.lengthOf(1);
        expect(store.readCount).to.equal(1);
    });

    it('should keep getActiveSession working when concurrent restores are followed by activation', async () => {
        // Opening a session from the session list runs restore + activate. A double-click on a
        // large (slow to load) session runs it twice concurrently. Without a guard this
        // registers the session twice, setActiveSession(id) marks both copies active, and every
        // getActiveSession() call throws from then on — disabling the chat Home button and
        // other session commands until the page is reloaded.
        await Promise.all([
            chatService.getOrRestoreSession(restoredId).then(() => chatService.setActiveSession(restoredId, { focus: true })),
            chatService.getOrRestoreSession(restoredId).then(() => chatService.setActiveSession(restoredId, { focus: true }))
        ]);

        const active = chatService.getActiveSession();
        expect(active).to.not.be.undefined;
        expect(active!.id).to.equal(restoredId);
    });

    it('should allow restoring again after a failed attempt', async () => {
        store.failReads = true;
        await chatService.getOrRestoreSession(restoredId).then(
            () => { throw new Error('expected the restore to fail'); },
            () => undefined
        );

        store.failReads = false;
        const session = await chatService.getOrRestoreSession(restoredId);
        expect(session).to.not.be.undefined;
        expect(session!.id).to.equal(restoredId);
    });
});
