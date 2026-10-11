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

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import {
    ActiveSessionChangedEvent,
    ChatServiceImpl,
    DefaultChatAgentId,
    PinChatAgent,
    SessionCreatedEvent,
    SessionDeletedEvent,
    SessionRenamedEvent
} from './chat-service';
import { ChatAgentService } from './chat-agent-service';
import { ChatRequestParser } from './chat-request-parser';
import { AIVariableService, ToolInvocationRegistry } from '@theia/ai-core';
import { ILogger } from '@theia/core';
import { ChatContentDeserializerRegistry, ChatContentDeserializerRegistryImpl, DefaultChatContentDeserializerContribution } from './chat-content-deserializer';
import { ChangeSetElementDeserializerRegistry, ChangeSetElementDeserializerRegistryImpl } from './change-set-element-deserializer';
import { ChatAgent, ChatAgentLocation } from './chat-agents';
import { ChatRequest } from './chat-model';
import { ParsedChatRequest, ParsedChatRequestTextPart } from './parsed-chat-request';

describe('ChatService session events', () => {
    let chatService: ChatServiceImpl;
    let container: Container;

    const mockDefaultAgent: ChatAgent = {
        id: 'default-agent',
        name: 'Default Agent',
        description: 'Test default agent',
        locations: [ChatAgentLocation.Panel],
        invoke: async () => { },
        languageModelRequirements: [],
        tags: [],
        variables: [],
        agentSpecificVariables: [],
        functions: [],
        prompts: []
    };

    class MockChatAgentService {
        readonly onDidChangeAgents = { dispose: () => { } };
        readonly onDefaultAgentChanged = { dispose: () => { } };

        getAgent(id: string): ChatAgent | undefined {
            return id === 'default-agent' ? mockDefaultAgent : undefined;
        }

        resolveAgent(): ChatAgent | undefined {
            return mockDefaultAgent;
        }
    }

    class MockChatRequestParser {
        async parseChatRequest(request: ChatRequest): Promise<ParsedChatRequest> {
            return {
                request,
                parts: [new ParsedChatRequestTextPart({ start: 0, endExclusive: request.text.length }, request.text)],
                toolRequests: new Map(),
                variables: []
            };
        }
    }

    class MockAIVariableService {
        async resolveVariable(): Promise<unknown> {
            return undefined;
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

        container.bind(ChatAgentService).toConstantValue(new MockChatAgentService() as unknown as ChatAgentService);
        container.bind(ChatRequestParser).toConstantValue(new MockChatRequestParser() as unknown as ChatRequestParser);
        container.bind(AIVariableService).toConstantValue(new MockAIVariableService() as unknown as AIVariableService);
        container.bind(ToolInvocationRegistry).toConstantValue({});
        container.bind(ILogger).toConstantValue(new MockLogger() as unknown as ILogger);

        container.bind(DefaultChatAgentId).toConstantValue({ id: 'default-agent' });
        container.bind(PinChatAgent).toConstantValue(true);

        const contentRegistry = new ChatContentDeserializerRegistryImpl();
        new DefaultChatContentDeserializerContribution().registerDeserializers(contentRegistry);
        container.bind(ChatContentDeserializerRegistry).toConstantValue(contentRegistry);
        container.bind(ChangeSetElementDeserializerRegistry).toConstantValue(new ChangeSetElementDeserializerRegistryImpl());
        container.bind(ChatServiceImpl).toSelf().inSingletonScope();

        chatService = container.get(ChatServiceImpl);
    });

    it('should fire a renamed event when sendRequest sets the session title', async () => {
        const session = chatService.createSession(ChatAgentLocation.Panel);
        expect(session.title).to.be.undefined;

        const events: (ActiveSessionChangedEvent | SessionCreatedEvent | SessionDeletedEvent | SessionRenamedEvent)[] = [];
        chatService.onSessionEvent(e => events.push(e));

        await chatService.sendRequest(session.id, { text: 'Hello world' });

        expect(session.title).to.equal('Hello world');
        const renamedEvents = events.filter(e => e.type === 'renamed');
        expect(renamedEvents).to.have.length(1);
        expect((renamedEvents[0] as SessionRenamedEvent).sessionId).to.equal(session.id);
    });

    it('should not fire a renamed event on subsequent requests when title is already set', async () => {
        const session = chatService.createSession(ChatAgentLocation.Panel);

        // First request sets the title
        await chatService.sendRequest(session.id, { text: 'First message' });
        expect(session.title).to.equal('First message');

        const events: (ActiveSessionChangedEvent | SessionCreatedEvent | SessionDeletedEvent | SessionRenamedEvent)[] = [];
        chatService.onSessionEvent(e => events.push(e));

        // Second request should not trigger a renamed event
        await chatService.sendRequest(session.id, { text: 'Second message' });

        const renamedEvents = events.filter(e => e.type === 'renamed');
        expect(renamedEvents).to.have.length(0);
        // Title should remain the first message
        expect(session.title).to.equal('First message');
    });

    it('should fire a renamed event via renameSession', async () => {
        const session = chatService.createSession(ChatAgentLocation.Panel);

        const events: (ActiveSessionChangedEvent | SessionCreatedEvent | SessionDeletedEvent | SessionRenamedEvent)[] = [];
        chatService.onSessionEvent(e => events.push(e));

        await chatService.renameSession(session.id, 'New Title');

        expect(session.title).to.equal('New Title');
        const renamedEvents = events.filter(e => e.type === 'renamed');
        expect(renamedEvents).to.have.length(1);
        expect((renamedEvents[0] as SessionRenamedEvent).sessionId).to.equal(session.id);
    });
});
