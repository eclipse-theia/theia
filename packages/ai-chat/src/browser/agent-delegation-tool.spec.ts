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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
FrontendApplicationConfigProvider.set({});

import { AIVariableResolutionRequest } from '@theia/ai-core';
import { Event } from '@theia/core';
import { expect } from 'chai';
import * as sinon from 'sinon';
import {
    ActiveSessionChangedEvent,
    ChatAgentService,
    ChatResponseContent,
    ChatService,
    SessionCreatedEvent,
    SessionDeletedEvent,
    SessionRenamedEvent,
    TextChatResponseContentImpl,
    ThinkingChatResponseContentImpl,
    ToolCallChatResponseContentImpl,
} from '../common';
import { ChatAgentServiceImpl } from '../common/chat-agent-service';
import { AgentDelegationTool } from './agent-delegation-tool';
import { TASK_CONTEXT_VARIABLE } from './task-context-variable';

disableJSDOM();

// --- Factory ---

interface StubLogger {
    error: sinon.SinonStub;
    warn: sinon.SinonStub;
    info: sinon.SinonStub;
    debug: sinon.SinonStub;
}

function makeStubLogger(): StubLogger {
    return { error: sinon.stub(), warn: sinon.stub(), info: sinon.stub(), debug: sinon.stub() };
}

function makeAgentDelegationTool(chatAgentService: ChatAgentService, chatService: ChatService, logger: StubLogger = makeStubLogger()): AgentDelegationTool {
    const tool = new AgentDelegationTool();
    Object.defineProperty(tool, 'getChatAgentService', { value: () => chatAgentService });
    Object.defineProperty(tool, 'getChatService', { value: () => chatService });
    Object.defineProperty(tool, 'logger', { value: logger });
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
    return { onDidChange: sinon.stub().returns({ dispose: sinon.stub() }) };
}

function makeNewSession(contextManager = makeContextManager()): {
    id: string;
    model: {
        context: ReturnType<typeof makeContextManager>;
        changeSet: ReturnType<typeof makeChangeSet>;
        onDidChange: sinon.SinonStub;
    };
} {
    return {
        id: 'new-session-id',
        model: {
            context: contextManager,
            changeSet: makeChangeSet(),
            onDidChange: sinon.stub().returns({ dispose: sinon.stub() })
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

function makeExistingSession(contextManager = makeContextManager()): {
    id: string;
    pinnedAgent: { id: string; name: string };
    rootSessionId: string;
    parentSessionId: string;
    model: {
        status: string;
        context: ReturnType<typeof makeContextManager>;
        changeSet: ReturnType<typeof makeChangeSet>;
        onDidChange: sinon.SinonStub;
        rootSessionId: string;
        parentSessionId: string;
    };
} {
    return {
        id: 'existing-session-id',
        pinnedAgent: { id: 'test-agent', name: 'Test Agent' },
        rootSessionId: 'original-root-id',
        parentSessionId: 'original-parent-id',
        model: {
            status: 'idle',
            context: contextManager,
            changeSet: makeChangeSet(),
            onDidChange: sinon.stub().returns({ dispose: sinon.stub() }),
            rootSessionId: 'original-root-id',
            parentSessionId: 'original-parent-id'
        }
    };
}

type SessionEvent = ActiveSessionChangedEvent | SessionCreatedEvent | SessionDeletedEvent | SessionRenamedEvent;

function makeChatService(newSession: ReturnType<typeof makeNewSession>, responseContent?: ChatResponseContent[]): ChatService {
    const content = responseContent ?? [{ kind: 'text', content: 'agent response', asString: () => 'agent response' }];
    const responseCompleted = Promise.resolve({
        response: { content }
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

    describe('delegateToAgent() — thinking content filtering', () => {
        it('excludes thinking content from the tool result', async () => {
            const thinkingContent = new ThinkingChatResponseContentImpl('some internal thinking', 'sig123');
            const textContent = new TextChatResponseContentImpl('final answer');

            const newSession = makeNewSession();
            const agentService = makeChatAgentService();
            const chatService = makeChatService(newSession, [thinkingContent, textContent]);
            const tool = makeAgentDelegationTool(agentService, chatService);
            const ctx = makeChatContext();

            const argString = JSON.stringify({ agentId: 'test-agent', prompt: 'do something' });
            const result = await tool.getTool().handler(argString, ctx);

            expect(result).to.equal('final answer\n\n[delegation sessionId: new-session-id]');
            expect(result).to.not.include('thinking');
        });

        it('excludes tool call content from the tool result', async () => {
            const toolCallContent = new ToolCallChatResponseContentImpl('call-1', 'someTool', '{}');
            const textContent = new TextChatResponseContentImpl('final answer');

            const newSession = makeNewSession();
            const agentService = makeChatAgentService();
            const chatService = makeChatService(newSession, [toolCallContent, textContent]);
            const tool = makeAgentDelegationTool(agentService, chatService);
            const ctx = makeChatContext();

            const argString = JSON.stringify({ agentId: 'test-agent', prompt: 'do something' });
            const result = await tool.getTool().handler(argString, ctx);

            expect(result).to.equal('final answer\n\n[delegation sessionId: new-session-id]');
        });

        it('returns only the session id marker when all content is thinking', async () => {
            const thinkingContent = new ThinkingChatResponseContentImpl('internal', 'sig');

            const newSession = makeNewSession();
            const agentService = makeChatAgentService();
            const chatService = makeChatService(newSession, [thinkingContent]);
            const tool = makeAgentDelegationTool(agentService, chatService);
            const ctx = makeChatContext();

            const argString = JSON.stringify({ agentId: 'test-agent', prompt: 'do something' });
            const result = await tool.getTool().handler(argString, ctx);

            expect(result).to.equal('[delegation sessionId: new-session-id]');
        });
    });

    describe('delegateToAgent() — delegation session id in result', () => {
        it('appends the delegation session id to the tool result', async () => {
            const newSession = makeNewSession();
            const agentService = makeChatAgentService();
            const chatService = makeChatService(newSession);
            const tool = makeAgentDelegationTool(agentService, chatService);
            const ctx = makeChatContext();

            const argString = JSON.stringify({ agentId: 'test-agent', prompt: 'do something' });
            const result = await tool.getTool().handler(argString, ctx);

            expect(result).to.equal('agent response\n\n[delegation sessionId: new-session-id]');
        });
    });

    describe('delegateToAgent() — sessionId parameter (resume)', () => {
        let contextManager: ReturnType<typeof makeContextManager>;
        let existingSession: ReturnType<typeof makeExistingSession>;
        let chatService: ChatService;
        let tool: AgentDelegationTool;
        let logger: StubLogger;
        let ctx: ReturnType<typeof makeChatContext>;

        beforeEach(() => {
            contextManager = makeContextManager();
            existingSession = makeExistingSession(contextManager);
            const newSession = makeNewSession();
            const agentService = makeChatAgentService();
            chatService = makeChatService(newSession);
            (chatService.getSession as sinon.SinonStub).withArgs('existing-session-id').returns(existingSession);
            logger = makeStubLogger();
            tool = makeAgentDelegationTool(agentService, chatService, logger);
            ctx = makeChatContext();
        });

        it('sends the follow-up request into the existing session instead of creating a new one', async () => {
            const argString = JSON.stringify({ agentId: 'test-agent', prompt: 'fix the findings', sessionId: 'existing-session-id' });

            const result = await tool.getTool().handler(argString, ctx);

            expect((chatService.createSession as sinon.SinonStub).called).to.be.false;
            const sendRequest = chatService.sendRequest as sinon.SinonStub;
            expect(sendRequest.calledOnce).to.be.true;
            expect(sendRequest.firstCall.args[0]).to.equal('existing-session-id');
            expect(result).to.equal('agent response\n\n[delegation sessionId: existing-session-id]');
        });

        it('re-establishes event bubbling from the resumed session to the parent', async () => {
            const argString = JSON.stringify({ agentId: 'test-agent', prompt: 'fix the findings', sessionId: 'existing-session-id' });

            await tool.getTool().handler(argString, ctx);

            expect(existingSession.model.onDidChange.calledOnce).to.be.true;
            expect(existingSession.model.changeSet.onDidChange.calledOnce).to.be.true;
        });

        it('does not modify rootSessionId or parentSessionId of the resumed session', async () => {
            const argString = JSON.stringify({ agentId: 'test-agent', prompt: 'fix the findings', sessionId: 'existing-session-id' });

            await tool.getTool().handler(argString, ctx);

            expect(existingSession.rootSessionId).to.equal('original-root-id');
            expect(existingSession.parentSessionId).to.equal('original-parent-id');
            expect(existingSession.model.rootSessionId).to.equal('original-root-id');
            expect(existingSession.model.parentSessionId).to.equal('original-parent-id');
        });

        it('adds the task context variable to the resumed session when taskContextId is provided', async () => {
            const argString = JSON.stringify({
                agentId: 'test-agent', prompt: 'fix the findings', sessionId: 'existing-session-id', taskContextId: 'follow-up-ctx-id'
            });

            await tool.getTool().handler(argString, ctx);

            expect(contextManager.addVariables.calledOnce).to.be.true;
            const callArg: AIVariableResolutionRequest = contextManager.addVariables.firstCall.args[0];
            expect(callArg.variable).to.equal(TASK_CONTEXT_VARIABLE);
            expect(callArg.arg).to.equal('follow-up-ctx-id');
        });

        it('returns an error when the sessionId is unknown', async () => {
            const argString = JSON.stringify({ agentId: 'test-agent', prompt: 'fix the findings', sessionId: 'unknown-session-id' });

            const result = await tool.getTool().handler(argString, ctx);

            expect(result).to.include('not found');
            expect((chatService.sendRequest as sinon.SinonStub).called).to.be.false;
            expect((chatService.createSession as sinon.SinonStub).called).to.be.false;
            expect(logger.warn.calledOnce).to.be.true;
            expect(logger.error.called).to.be.false;
        });

        it('returns an error when the resumed session is still processing a request', async () => {
            existingSession.model.status = 'running';
            const argString = JSON.stringify({ agentId: 'test-agent', prompt: 'fix the findings', sessionId: 'existing-session-id' });

            const result = await tool.getTool().handler(argString, ctx);

            expect(result).to.include('still processing');
            expect((chatService.sendRequest as sinon.SinonStub).called).to.be.false;
            expect(logger.warn.calledOnce).to.be.true;
            expect(logger.error.called).to.be.false;
        });

        it('returns an error when agentId does not match the pinned agent of the session', async () => {
            existingSession.pinnedAgent = { id: 'other-agent', name: 'Other Agent' };
            const argString = JSON.stringify({ agentId: 'test-agent', prompt: 'fix the findings', sessionId: 'existing-session-id' });

            const result = await tool.getTool().handler(argString, ctx);

            expect(result).to.include("belongs to agent 'other-agent'");
            expect((chatService.sendRequest as sinon.SinonStub).called).to.be.false;
            expect(logger.error.calledOnce).to.be.true;
            expect(logger.warn.called).to.be.false;
        });
    });

    describe('delegateToAgent() — session persistence', () => {
        it('does not delete the delegated session after completion', async () => {
            const newSession = makeNewSession();
            const agentService = makeChatAgentService();
            const chatService = makeChatService(newSession);
            const tool = makeAgentDelegationTool(agentService, chatService);
            const ctx = makeChatContext();

            const argString = JSON.stringify({ agentId: 'test-agent', prompt: 'do something' });
            await tool.getTool().handler(argString, ctx);

            // deleteSession should never have been called for the delegated session
            expect((chatService.deleteSession as sinon.SinonStub).called).to.be.false;
        });
    });
});
