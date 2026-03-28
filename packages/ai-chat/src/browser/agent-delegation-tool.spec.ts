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
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import * as sinon from 'sinon';
import { AgentDelegationTool } from './agent-delegation-tool';
import { TASK_CONTEXT_VARIABLE } from './task-context-variable';
import { AIVariableResolutionRequest } from '@theia/ai-core';
import {
    ActiveSessionChangedEvent,
    ChatAgentService,
    ChatService,
    SessionCreatedEvent,
    SessionDeletedEvent,
    SessionRenamedEvent,
} from '../common';
import { ChatAgentServiceImpl } from '../common/chat-agent-service';
import { Event } from '@theia/core';

disableJSDOM();

// --- Factory ---

function makeAgentDelegationTool(chatAgentService: ChatAgentService, chatService: ChatService): AgentDelegationTool {
    const tool = new AgentDelegationTool();
    Object.defineProperty(tool, 'getChatAgentService', { value: () => chatAgentService });
    Object.defineProperty(tool, 'getChatService', { value: () => chatService });
    return tool;
}

// --- Helper factories ---

function makeContextManager(): { addVariables: sinon.SinonStub; getVariables: sinon.SinonStub } {
    return {
        addVariables: sinon.stub(),
        getVariables: sinon.stub().returns([])
    };
}

function makeChangeSet(): { onDidChange: sinon.SinonStub } {
    return { onDidChange: sinon.stub() };
}

function makeNewSession(contextManager = makeContextManager()): {
    id: string;
    model: {
        context: ReturnType<typeof makeContextManager>;
        changeSet: ReturnType<typeof makeChangeSet>;
    };
} {
    return {
        id: 'new-session-id',
        model: {
            context: contextManager,
            changeSet: makeChangeSet()
        }
    };
}

function makeParentSession(): {
    id: string;
    model: {
        changeSet: { onDidChange: sinon.SinonStub; getElements: sinon.SinonStub };
    };
} {
    return {
        id: 'parent-session-id',
        model: {
            changeSet: {
                onDidChange: sinon.stub(),
                getElements: sinon.stub().returns([])
            }
        }
    };
}

function makeChatAgentService(agentExists = true): ChatAgentService {
    const stub = sinon.createStubInstance(ChatAgentServiceImpl);
    stub.getAgent.returns(agentExists ? { id: 'test-agent', name: 'Test Agent' } as never : undefined);
    stub.getAgents.returns([]);
    return stub as ChatAgentService;
}

function makeChatContext(): {
    cancellationToken: undefined;
    toolCallId: undefined;
    request: { session: ReturnType<typeof makeParentSession> };
    response: object;
} {
    return {
        cancellationToken: undefined,
        toolCallId: undefined,
        request: { session: makeParentSession() },
        response: {}
    };
}

type SessionEvent = ActiveSessionChangedEvent | SessionCreatedEvent | SessionDeletedEvent | SessionRenamedEvent;

function makeChatService(newSession: ReturnType<typeof makeNewSession>): ChatService {
    const responseCompleted = Promise.resolve({
        response: { asString: () => 'agent response' }
    });
    return {
        onSessionEvent: sinon.stub() as Event<SessionEvent>,
        getSession: sinon.stub(),
        getSessions: sinon.stub().returns([]),
        getActiveSession: sinon.stub().returns({ id: 'active-session-id' }),
        setActiveSession: sinon.stub(),
        createSession: sinon.stub().returns(newSession),
        sendRequest: sinon.stub().resolves({ responseCompleted }),
        deleteSession: sinon.stub().resolves(),
        renameSession: sinon.stub().resolves(),
        getAgent: sinon.stub(),
        deleteChangeSet: sinon.stub(),
        deleteChangeSetElement: sinon.stub(),
        cancelRequest: sinon.stub().resolves(),
        getOrRestoreSession: sinon.stub().resolves(undefined),
        getPersistedSessions: sinon.stub().resolves({}),
        hasPersistedSessions: sinon.stub().resolves(false),
    };
}

// --- Tests ---

describe('AgentDelegationTool', () => {
    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    describe('delegateToAgent() — taskContextId parameter', () => {
        let contextManager: ReturnType<typeof makeContextManager>;
        let tool: AgentDelegationTool;
        let ctx: ReturnType<typeof makeChatContext>;

        beforeEach(() => {
            contextManager = makeContextManager();
            const newSession = makeNewSession(contextManager);
            const agentService = makeChatAgentService();
            const chatService = makeChatService(newSession);
            tool = makeAgentDelegationTool(agentService, chatService);
            ctx = makeChatContext();
        });

        it('injects TASK_CONTEXT_VARIABLE when taskContextId is provided', async () => {
            const argString = JSON.stringify({ agentId: 'test-agent', prompt: 'do something', taskContextId: 'my-task-ctx-id' });

            await tool.getTool().handler(argString, ctx);

            expect(contextManager.addVariables.calledOnce).to.be.true;
            const callArg: AIVariableResolutionRequest = contextManager.addVariables.firstCall.args[0];
            expect(callArg.variable).to.equal(TASK_CONTEXT_VARIABLE);
            expect(callArg.arg).to.equal('my-task-ctx-id');
        });

        it('does not inject any task context variable when taskContextId is not provided', async () => {
            const argString = JSON.stringify({ agentId: 'test-agent', prompt: 'do something' });

            await tool.getTool().handler(argString, ctx);

            expect(contextManager.addVariables.called).to.be.false;
        });

        it('does not inject any task context variable when taskContextId is an empty string', async () => {
            const argString = JSON.stringify({ agentId: 'test-agent', prompt: 'do something', taskContextId: '' });

            await tool.getTool().handler(argString, ctx);

            expect(contextManager.addVariables.called).to.be.false;
        });
    });
});
