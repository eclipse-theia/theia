// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import * as sinon from 'sinon';
import { Container } from '@theia/core/shared/inversify';
import { ChatServiceImpl } from './chat-service';
import { ChatAgentService } from './chat-agent-service';
import { ChatSessionStore } from './chat-session-store';
import { ChatContentDeserializerRegistry } from './chat-content-deserializer';
import { ChangeSetElementDeserializerRegistry } from './change-set-element-deserializer';
import { ToolInvocationRegistry, AIVariableService } from '@theia/ai-core';
import { ILogger } from '@theia/core';
import { ChatRequestParser } from './chat-request-parser';

disableJSDOM();

describe('ChatServiceImpl', () => {
    let sandbox: sinon.SinonSandbox;
    let chatService: ChatServiceImpl;
    let mockSessionStore: sinon.SinonStubbedInstance<ChatSessionStore>;
    let mockAgentService: sinon.SinonStubbedInstance<ChatAgentService>;
    let mockDeserRegistry: sinon.SinonStubbedInstance<ChatContentDeserializerRegistry>;
    let mockChangeSetDeserRegistry: sinon.SinonStubbedInstance<ChangeSetElementDeserializerRegistry>;
    let mockToolInvocationRegistry: sinon.SinonStubbedInstance<ToolInvocationRegistry>;
    let mockVariableService: sinon.SinonStubbedInstance<AIVariableService>;
    let mockRequestParser: sinon.SinonStubbedInstance<ChatRequestParser>;
    let mockLogger: sinon.SinonStubbedInstance<ILogger>;

    beforeEach(() => {
        sandbox = sinon.createSandbox();

        mockSessionStore = {
            storeSessions: sandbox.stub().resolves(),
            readSession: sandbox.stub().resolves(undefined) as never,
            deleteSession: sandbox.stub().resolves() as never,
            clearAllSessions: sandbox.stub().resolves() as never,
            getSessionIndex: sandbox.stub().resolves({}) as never,
            hasPersistedSessions: sandbox.stub().resolves(false) as never
        };

        mockAgentService = {
            getAgent: sandbox.stub().returns(undefined),
            getAgents: sandbox.stub().returns([]),
            resolveAgent: sandbox.stub().returns(undefined)
        } as sinon.SinonStubbedInstance<ChatAgentService>;

        mockDeserRegistry = {
            deserialize: sandbox.stub().resolves([])
        } as sinon.SinonStubbedInstance<ChatContentDeserializerRegistry>;

        mockChangeSetDeserRegistry = {
            deserialize: sandbox.stub().resolves([])
        } as sinon.SinonStubbedInstance<ChangeSetElementDeserializerRegistry>;

        mockToolInvocationRegistry = {
            getFunction: sandbox.stub().returns(undefined)
        } as sinon.SinonStubbedInstance<ToolInvocationRegistry>;

        mockVariableService = {
            resolveVariable: sandbox.stub().resolves(undefined)
        } as sinon.SinonStubbedInstance<AIVariableService>;

        mockRequestParser = {
            parseChatRequest: sandbox.stub().resolves({ parts: [], toolRequests: [], variables: [] })
        } as sinon.SinonStubbedInstance<ChatRequestParser>;

        mockLogger = {
            debug: sandbox.stub(),
            info: sandbox.stub(),
            warn: sandbox.stub(),
            error: sandbox.stub()
        } as sinon.SinonStubbedInstance<ILogger>;

        const container = new Container();
        container.bind(ChatServiceImpl).toSelf().inSingletonScope();
        container.bind(ChatAgentService).toConstantValue(mockAgentService);
        container.bind(ChatSessionStore).toConstantValue(mockSessionStore);
        container.bind(ChatContentDeserializerRegistry).toConstantValue(mockDeserRegistry);
        container.bind(ChangeSetElementDeserializerRegistry).toConstantValue(mockChangeSetDeserRegistry);
        container.bind(ToolInvocationRegistry).toConstantValue(mockToolInvocationRegistry);
        container.bind(ChatRequestParser).toConstantValue(mockRequestParser);
        container.bind(AIVariableService).toConstantValue(mockVariableService);
        container.bind(ILogger).toConstantValue(mockLogger);

        chatService = container.get(ChatServiceImpl);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('deleteSession', () => {
        it('should delete child sessions when deleting a parent session', async () => {
            // Create a parent session
            const parentSession = chatService.createSession();

            // Create a child session by directly setting rootSessionId
            const childSession = chatService.createSession();
            childSession.rootSessionId = parentSession.id;

            // Delete the parent session
            await chatService.deleteSession(parentSession.id);

            // Verify parent session was deleted
            expect(chatService.getSession(parentSession.id)).to.be.undefined;

            // Verify child session was also deleted (cascade delete)
            expect(chatService.getSession(childSession.id)).to.be.undefined;

            // Verify deleteSession was called for both sessions
            expect(mockSessionStore.deleteSession.callCount).to.equal(2);
            expect(mockSessionStore.deleteSession.calledWith(parentSession.id)).to.be.true;
            expect(mockSessionStore.deleteSession.calledWith(childSession.id)).to.be.true;
        });

        it('should handle multiple child sessions', async () => {
            // Create a parent session
            const parentSession = chatService.createSession();

            // Create multiple child sessions
            const child1 = chatService.createSession();
            child1.rootSessionId = parentSession.id;
            const child2 = chatService.createSession();
            child2.rootSessionId = parentSession.id;
            const child3 = chatService.createSession();
            child3.rootSessionId = parentSession.id;

            // Delete the parent session
            await chatService.deleteSession(parentSession.id);

            // Verify all sessions were deleted
            expect(chatService.getSession(parentSession.id)).to.be.undefined;
            expect(chatService.getSession(child1.id)).to.be.undefined;
            expect(chatService.getSession(child2.id)).to.be.undefined;
            expect(chatService.getSession(child3.id)).to.be.undefined;

            // Verify deleteSession was called for all sessions
            expect(mockSessionStore.deleteSession.callCount).to.equal(4);
        });

        it('should not delete sessions without rootSessionId', async () => {
            // Create a standalone session
            const standaloneSession = chatService.createSession();

            // Delete it
            await chatService.deleteSession(standaloneSession.id);

            // Verify only that session was deleted
            expect(chatService.getSession(standaloneSession.id)).to.be.undefined;
            expect(mockSessionStore.deleteSession.callCount).to.equal(1);
        });

        it('should delete persisted-only child sessions that are not loaded in memory', async () => {
            // Parent is in memory; the child exists only in the persisted index (e.g. after a reload).
            const parentSession = chatService.createSession();
            const persistedChildId = 'persisted-child-id';
            mockSessionStore.getSessionIndex.resolves({
                [persistedChildId]: {
                    sessionId: persistedChildId,
                    title: 'Persisted child',
                    saveDate: 0,
                    location: parentSession.model.location,
                    rootSessionId: parentSession.id
                }
            });

            await chatService.deleteSession(parentSession.id);

            // Both the in-memory parent and the persisted-only child are removed from storage.
            expect(mockSessionStore.deleteSession.calledWith(parentSession.id)).to.be.true;
            expect(mockSessionStore.deleteSession.calledWith(persistedChildId)).to.be.true;
        });

        it('should not delete sessions with different rootSessionId', async () => {
            // Create two independent sessions
            const session1 = chatService.createSession();
            const session2 = chatService.createSession();

            // Set session2 as a child of a non-existent session
            session2.rootSessionId = 'non-existent-session-id';

            // Delete session1
            await chatService.deleteSession(session1.id);

            // Verify only session1 was deleted
            expect(chatService.getSession(session1.id)).to.be.undefined;
            expect(chatService.getSession(session2.id)).to.not.be.undefined;
            expect(mockSessionStore.deleteSession.callCount).to.equal(1);
            expect(mockSessionStore.deleteSession.calledWith(session1.id)).to.be.true;
        });
    });
});
