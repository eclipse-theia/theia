// *****************************************************************************
// Copyright (C) 2026 Yash Kakade and others.
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

import 'reflect-metadata';

import { expect } from 'chai';
import { AIVariableService, LanguageModelMessage, LanguageModelRequirement, LanguageModelResponse, ToolInvocationRegistry } from '@theia/ai-core';
import { ILogger } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { Container } from '@theia/core/shared/inversify';
import { ChangeSetElementDeserializerRegistry, ChangeSetElementDeserializerRegistryImpl } from './change-set-element-deserializer';
import { AbstractChatAgent, ChatAgent, ChatAgentLocation } from './chat-agents';
import { ChatAgentService } from './chat-agent-service';
import { ChatContentDeserializerRegistry, ChatContentDeserializerRegistryImpl, DefaultChatContentDeserializerContribution } from './chat-content-deserializer';
import {
    ChatModel,
    ChatRequest,
    ChatSessionCompaction,
    CompactionChatResponseContentImpl,
    ErrorChatResponseContentImpl,
    MutableChatModel,
    MutableChatRequestModel,
    SESSION_COMPACTION_PROVIDER,
    TextChatResponseContentImpl,
} from './chat-model';
import { ChatRequestParser } from './chat-request-parser';
import { ChatServiceImpl } from './chat-service';
import { ChatSessionCompactionService } from './chat-session-compaction';
import { ChatSessionStore } from './chat-session-store';
import { ParsedChatRequest, ParsedChatRequestTextPart } from './parsed-chat-request';

class TestChatAgent extends AbstractChatAgent {
    readonly id = 'test-agent';
    readonly name = 'Test Agent';
    readonly languageModelRequirements: LanguageModelRequirement[] = [];
    protected readonly defaultLanguageModelPurpose = 'chat';
    protected override logger: ILogger = new MockLogger();

    protected addContentsToResponse(_response: LanguageModelResponse, _request: MutableChatRequestModel): Promise<void> {
        return Promise.resolve();
    }

    public exposeGetMessages(model: ChatModel): Promise<LanguageModelMessage[]> {
        return this.getMessages(model);
    }
}

function parsed(text: string, request?: Partial<ChatRequest>): ParsedChatRequest {
    return {
        request: { text, ...request },
        parts: [new ParsedChatRequestTextPart({ start: 0, endExclusive: text.length }, text)],
        toolRequests: new Map(),
        variables: []
    };
}

function addExchange(model: MutableChatModel, text: string, answer: string, request?: Partial<ChatRequest>): MutableChatRequestModel {
    const added = model.addRequest(parsed(text, request));
    added.response.response.addContent(new TextChatResponseContentImpl(answer));
    added.response.complete();
    return added;
}

function addCompaction(model: MutableChatModel, summary: string): MutableChatRequestModel {
    const added = model.addRequest(parsed('/compact'));
    added.markAsCompactionRequest();
    added.response.response.addContent(new CompactionChatResponseContentImpl(SESSION_COMPACTION_PROVIDER, undefined, summary));
    added.response.complete();
    return added;
}

function addFailedCompaction(model: MutableChatModel): MutableChatRequestModel {
    const added = model.addRequest(parsed('/compact'));
    added.markAsCompactionRequest();
    const error = new Error('no model');
    added.response.response.addContent(new ErrorChatResponseContentImpl(error));
    added.response.error(error);
    return added;
}

function texts(messages: LanguageModelMessage[]): string[] {
    return messages.filter(LanguageModelMessage.isTextMessage).map(message => `${message.actor}: ${message.text}`);
}

const SUMMARY_PREFIX = 'The earlier part of this conversation was compacted. This is its summary:';

describe('ChatSessionCompaction', () => {

    describe('stale requests', () => {
        it('has no stale requests in a session without a compaction', () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            const requests = [addExchange(model, 'one', 'a'), addExchange(model, 'two', 'b')];

            expect(ChatSessionCompaction.getStaleRequests(model)).to.deep.equal([]);
            expect(ChatSessionCompaction.getPromptRequests(model)).to.deep.equal(requests);
        });

        it('makes all requests before the boundary stale', () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            const one = addExchange(model, 'one', 'a');
            const two = addExchange(model, 'two', 'b');
            const boundary = addCompaction(model, 'summary');
            const three = addExchange(model, 'three', 'c');

            expect(ChatSessionCompaction.getStaleRequests(model)).to.deep.equal([one, two]);
            expect(ChatSessionCompaction.getPromptRequests(model)).to.deep.equal([boundary, three]);
        });

        it('uses the latest boundary', () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            const one = addExchange(model, 'one', 'a');
            const first = addCompaction(model, 'first');
            const two = addExchange(model, 'two', 'b');
            const second = addCompaction(model, 'second');

            expect(ChatSessionCompaction.getStaleRequests(model)).to.deep.equal([one, first, two]);
            expect(ChatSessionCompaction.getPromptRequests(model)).to.deep.equal([second]);
        });

        it('does not treat a failed compaction as a boundary', () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            addExchange(model, 'one', 'a');
            addFailedCompaction(model);

            expect(ChatSessionCompaction.getStaleRequests(model)).to.deep.equal([]);
        });

        it('does not treat a server-side compaction marker as a boundary', () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            addExchange(model, 'one', 'a');
            const request = model.addRequest(parsed('two'));
            request.response.response.addContent(new CompactionChatResponseContentImpl('anthropic', { block: 'opaque' }, 'provider summary'));
            request.response.complete();

            expect(ChatSessionCompaction.isBoundary(request)).to.equal(false);
            expect(ChatSessionCompaction.getStaleRequests(model)).to.deep.equal([]);
        });

        it('follows the active branch when the user edits a stale request', () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            const one = addExchange(model, 'one', 'a');
            addExchange(model, 'two', 'b');
            addCompaction(model, 'summary');
            expect(ChatSessionCompaction.getStaleRequests(model)).to.have.lengthOf(2);

            const edited = addExchange(model, 'two, edited', 'c', { referencedRequestId: model.getRequests()[1].id });

            expect(model.getRequests()).to.deep.equal([one, edited]);
            expect(ChatSessionCompaction.getStaleRequests(model)).to.deep.equal([]);
        });
    });

    describe('prompt messages', () => {
        const agent = new TestChatAgent();

        it('sends the summary and later messages, and not the stale messages or the command', async () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            addExchange(model, 'one', 'a');
            addCompaction(model, 'the summary');
            addExchange(model, 'two', 'b');

            expect(texts(await agent.exposeGetMessages(model))).to.deep.equal([
                `user: ${SUMMARY_PREFIX}\n\nthe summary`,
                'user: two',
                'ai: b'
            ]);
        });

        it('starts the prompt with a user message and uses no compaction message, so that all providers accept it', async () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            addExchange(model, 'one', 'a');
            addCompaction(model, 'the summary');

            const messages = await agent.exposeGetMessages(model);

            expect(messages).to.have.lengthOf(1);
            expect(messages[0].actor).to.equal('user');
            expect(messages.filter(LanguageModelMessage.isCompactionMessage)).to.have.lengthOf(0);
        });

        it('keeps the full history if a compaction failed, and does not send the failed attempt', async () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            addExchange(model, 'one', 'a');
            addFailedCompaction(model);
            addExchange(model, 'two', 'b');

            expect(texts(await agent.exposeGetMessages(model))).to.deep.equal(['user: one', 'ai: a', 'user: two', 'ai: b']);
        });

        it('keeps the earlier summary if a later compaction failed', async () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            addExchange(model, 'one', 'a');
            addCompaction(model, 'the summary');
            addFailedCompaction(model);

            expect(texts(await agent.exposeGetMessages(model))).to.deep.equal([`user: ${SUMMARY_PREFIX}\n\nthe summary`]);
        });

        it('still replays a server-side marker in a session without a manual compaction', async () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            addExchange(model, 'one', 'a');
            const request = model.addRequest(parsed('two'));
            request.response.response.addContent(new CompactionChatResponseContentImpl('anthropic', { block: 'opaque' }, 'provider summary'));
            request.response.complete();

            const messages = await agent.exposeGetMessages(model);

            expect(messages.filter(LanguageModelMessage.isCompactionMessage).map(message => message.provider)).to.deep.equal(['anthropic']);
            expect(texts(messages)).to.deep.equal(['user: one', 'ai: a', 'user: two']);
        });

        it('drops a server-side marker before the boundary and replays one after the boundary', async () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            const before = model.addRequest(parsed('one'));
            before.response.response.addContent(new CompactionChatResponseContentImpl('anthropic', { block: 'before' }));
            before.response.complete();
            addCompaction(model, 'the summary');
            const after = model.addRequest(parsed('two'));
            after.response.response.addContent(new CompactionChatResponseContentImpl('anthropic', { block: 'after' }));
            after.response.complete();

            const markers = (await agent.exposeGetMessages(model)).filter(LanguageModelMessage.isCompactionMessage);

            expect(markers.map(marker => marker.data)).to.deep.equal([{ block: 'after' }]);
        });
    });

    describe('chat service', () => {
        let chatService: ChatServiceImpl;
        let invokedAgents: string[];
        let compacted: MutableChatRequestModel[];
        let isCommand: boolean;
        const agent = { id: 'default-agent', locations: [ChatAgentLocation.Panel], invoke: async () => { invokedAgents.push('default-agent'); } } as unknown as ChatAgent;
        let stored: unknown;

        beforeEach(() => {
            invokedAgents = [];
            compacted = [];
            isCommand = true;
            stored = undefined;
            const container = new Container();
            container.bind(ChatAgentService).toConstantValue({ getAgent: () => agent, resolveAgent: () => agent } as unknown as ChatAgentService);
            container.bind(ChatRequestParser).toConstantValue({ parseChatRequest: async (request: ChatRequest) => parsed(request.text) } as unknown as ChatRequestParser);
            container.bind(AIVariableService).toConstantValue({ resolveVariable: async () => undefined } as unknown as AIVariableService);
            container.bind(ToolInvocationRegistry).toConstantValue({} as ToolInvocationRegistry);
            container.bind(ILogger).toConstantValue(new MockLogger());
            const contentRegistry = new ChatContentDeserializerRegistryImpl();
            new DefaultChatContentDeserializerContribution().registerDeserializers(contentRegistry);
            container.bind(ChatContentDeserializerRegistry).toConstantValue(contentRegistry);
            container.bind(ChangeSetElementDeserializerRegistry).toConstantValue(new ChangeSetElementDeserializerRegistryImpl());
            container.bind(ChatSessionStore).toConstantValue({
                storeSessions: async () => { },
                readSession: async () => stored,
                deleteSession: async () => { },
                clearAllSessions: async () => { },
                getSessionIndex: async () => ({}),
                hasPersistedSessions: async () => false
            } as unknown as ChatSessionStore);
            container.bind(ChatSessionCompactionService).toConstantValue({
                isCompactionCommand: () => isCommand,
                compact: async (request: MutableChatRequestModel) => { compacted.push(request); }
            });
            container.bind(ChatServiceImpl).toSelf().inSingletonScope();
            chatService = container.get(ChatServiceImpl);
        });

        it('sends a compaction command to the compaction service and not to the agent', async () => {
            const session = chatService.createSession(ChatAgentLocation.Panel);

            await chatService.sendRequest(session.id, { text: '/compact' });

            expect(compacted).to.have.lengthOf(1);
            expect(invokedAgents).to.deep.equal([]);
            expect(session.model.getRequests()).to.have.lengthOf(1);
            expect(chatService.getActiveSession()?.id).to.equal(session.id);
        });

        it('sends other requests to the agent', async () => {
            isCommand = false;
            const session = chatService.createSession(ChatAgentLocation.Panel);

            await chatService.sendRequest(session.id, { text: 'hello' });

            expect(compacted).to.deep.equal([]);
            expect(invokedAgents).to.deep.equal(['default-agent']);
        });

        it('restores a compacted session with the same prompt', async () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            addExchange(model, 'one', 'a');
            const boundary = addCompaction(model, 'the summary');
            boundary.response.setTokenUsage({ inputTokens: 1000, outputTokens: 10 });
            addExchange(model, 'two', 'b');
            const testAgent = new TestChatAgent();
            const expected = texts(await testAgent.exposeGetMessages(model));
            stored = { sessionId: model.id, title: 'title', saveDate: 1, model: JSON.parse(JSON.stringify(model.toSerializable())) };

            const restored = await chatService.getOrRestoreSession(model.id);

            expect(restored).to.not.equal(undefined);
            const requests = restored!.model.getRequests();
            expect(requests[1].isCompactionRequest).to.equal(true);
            expect(requests[0].isCompactionRequest).to.equal(false);
            expect(ChatSessionCompaction.getStaleRequests(restored!.model).map(request => request.id)).to.deep.equal([requests[0].id]);
            expect(texts(await testAgent.exposeGetMessages(restored!.model))).to.deep.equal(expected);
            expect(requests[1].response.tokenUsage).to.deep.equal({ inputTokens: 1000, outputTokens: 10 });
        });

        it('restores a session from an earlier version with its full history', async () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            addExchange(model, 'one', 'a');
            addExchange(model, 'two', 'b');
            const serialized = JSON.parse(JSON.stringify(model.toSerializable()));
            for (const request of serialized.requests) {
                expect(request).to.not.have.property('isCompactionRequest');
            }
            stored = { sessionId: model.id, title: 'title', saveDate: 1, model: serialized };

            const restored = await chatService.getOrRestoreSession(model.id);

            expect(ChatSessionCompaction.getStaleRequests(restored!.model)).to.deep.equal([]);
            expect(texts(await new TestChatAgent().exposeGetMessages(restored!.model))).to.deep.equal(['user: one', 'ai: a', 'user: two', 'ai: b']);
        });
    });
});
