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
import { ChatServiceImpl, ChatSession, DefaultChatAgentId, PinChatAgent } from './chat-service';
import { ChatAgentService } from './chat-agent-service';
import { ChatRequestParser } from './chat-request-parser';
import { AIVariableService, ToolInvocationRegistry } from '@theia/ai-core';
import { ILogger } from '@theia/core';
import { ChatContentDeserializerRegistry, ChatContentDeserializerRegistryImpl, DefaultChatContentDeserializerContribution } from './chat-content-deserializer';
import { ChangeSetElementDeserializerRegistry, ChangeSetElementDeserializerRegistryImpl } from './change-set-element-deserializer';
import { ChatAgent, ChatAgentLocation } from './chat-agents';
import { ParsedChatRequest, ParsedChatRequestAgentPart, ParsedChatRequestTextPart } from './parsed-chat-request';
import { ChatRequest } from './chat-model';

describe('ChatService pinned agent behavior', () => {
    let chatService: ChatServiceImpl;
    let mockAgentService: MockChatAgentService;
    let container: Container;

    const mockPinnedAgent: ChatAgent = {
        id: 'pinned-agent',
        name: 'Pinned Agent',
        description: 'Test pinned agent',
        locations: [ChatAgentLocation.Panel],
        invoke: async () => { },
        languageModelRequirements: [],
        tags: [],
        variables: [],
        agentSpecificVariables: [],
        functions: [],
        prompts: []
    };

    const mockMentionedAgent: ChatAgent = {
        id: 'mentioned-agent',
        name: 'Mentioned Agent',
        description: 'Test mentioned agent',
        locations: [ChatAgentLocation.Panel],
        invoke: async () => { },
        languageModelRequirements: [],
        tags: [],
        variables: [],
        agentSpecificVariables: [],
        functions: [],
        prompts: []
    };

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
        private agents = new Map<string, ChatAgent>([
            ['pinned-agent', mockPinnedAgent],
            ['mentioned-agent', mockMentionedAgent],
            ['default-agent', mockDefaultAgent]
        ]);

        readonly onDidChangeAgents = { dispose: () => { } };
        readonly onDefaultAgentChanged = { dispose: () => { } };

        getAgent(id: string): ChatAgent | undefined {
            return this.agents.get(id);
        }

        removeAgent(id: string): void {
            this.agents.delete(id);
        }

        resolveAgent(): ChatAgent | undefined {
            return this.agents.get('default-agent');
        }
    }

    class MockChatRequestParser {
        async parseChatRequest(request: ChatRequest): Promise<ParsedChatRequest> {
            const agentId = this.getMentionedAgentId(request.text);
            const parts = agentId
                ? [
                    new ParsedChatRequestAgentPart({ start: 0, endExclusive: agentId.length + 1 }, agentId, agentId),
                    new ParsedChatRequestTextPart({ start: agentId.length + 2, endExclusive: request.text.length }, request.text.substring(agentId.length + 2))
                ]
                : [
                    new ParsedChatRequestTextPart({ start: 0, endExclusive: request.text.length }, request.text)
                ];

            return {
                request,
                parts,
                toolRequests: new Map(),
                variables: []
            };
        }

        private getMentionedAgentId(text: string): string | undefined {
            if (!text.startsWith('@')) {
                return undefined;
            }
            const spaceIndex = text.indexOf(' ');
            if (spaceIndex === -1) {
                return text.substring(1) || undefined;
            }
            return text.substring(1, spaceIndex) || undefined;
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
        mockAgentService = new MockChatAgentService();

        container.bind(ChatAgentService).toConstantValue(mockAgentService as unknown as ChatAgentService);
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

    function createMockSession(pinnedAgent?: ChatAgent): ChatSession {
        const session = chatService.createSession(ChatAgentLocation.Panel);
        if (pinnedAgent) {
            session.pinnedAgent = pinnedAgent;
        }
        return session;
    }

    it('should preserve precedence: mentioned agent > pinned agent > default', () => {
        const session = createMockSession(mockPinnedAgent);
        const parsedRequest: ParsedChatRequest = {
            request: { text: '@mentioned-agent test' },
            parts: [
                new ParsedChatRequestAgentPart({ start: 0, endExclusive: '@mentioned-agent'.length }, 'mentioned-agent', 'mentioned-agent'),
                new ParsedChatRequestTextPart({ start: '@mentioned-agent '.length, endExclusive: '@mentioned-agent test'.length }, 'test')
            ],
            toolRequests: new Map(),
            variables: []
        };

        const agent = chatService.getAgent(parsedRequest, session);
        expect(agent).to.equal(mockMentionedAgent);
    });

    it('should return pinned agent when no mention exists', () => {
        const session = createMockSession(mockPinnedAgent);
        const parsedRequest: ParsedChatRequest = {
            request: { text: 'test message' },
            parts: [new ParsedChatRequestTextPart({ start: 0, endExclusive: 'test message'.length }, 'test message')],
            toolRequests: new Map(),
            variables: []
        };

        const agent = chatService.getAgent(parsedRequest, session);
        expect(agent).to.equal(mockPinnedAgent);
    });

    it('should return default agent when no mention and no pinned agent exist', () => {
        const session = createMockSession(undefined);
        const parsedRequest: ParsedChatRequest = {
            request: { text: 'test message' },
            parts: [new ParsedChatRequestTextPart({ start: 0, endExclusive: 'test message'.length }, 'test message')],
            toolRequests: new Map(),
            variables: []
        };

        const agent = chatService.getAgent(parsedRequest, session);
        expect(agent).to.equal(mockDefaultAgent);
    });

    it('should auto-pin selected agent during sendRequest', async () => {
        const session = createMockSession(mockPinnedAgent);

        await chatService.sendRequest(session.id, { text: '@mentioned-agent test' });

        // The selected agent (mentioned-agent) becomes the new pinned agent
        expect(session.pinnedAgent).to.equal(mockMentionedAgent);
    });
});
