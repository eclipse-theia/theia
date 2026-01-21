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
import { ChatServiceImpl, ChatSession } from './chat-service';
import { ChatAgentService } from './chat-agent-service';
import { ChatRequestParser } from './chat-request-parser';
import { AIVariableService } from '@theia/ai-core';
import { ILogger } from '@theia/core';
import { ChatContentDeserializerRegistry, ChatContentDeserializerRegistryImpl, DefaultChatContentDeserializerContribution } from './chat-content-deserializer';
import { ChangeSetElementDeserializerRegistry, ChangeSetElementDeserializerRegistryImpl } from './change-set-element-deserializer';
import { ChatAgent, ChatAgentLocation } from './chat-agents';
import { ParsedChatRequest, ParsedChatRequestAgentPart, ParsedChatRequestTextPart } from './parsed-chat-request';
import { ChatRequest } from './chat-model';

describe('ChatService getPinnedAgent', () => {
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

        getAgent(id: string): ChatAgent | undefined {
            return this.agents.get(id);
        }

        getAgents(): ChatAgent[] {
            return Array.from(this.agents.values());
        }

        removeAgent(id: string): void {
            this.agents.delete(id);
        }

        addAgent(agent: ChatAgent): void {
            this.agents.set(agent.id, agent);
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
        mockAgentService = new MockChatAgentService();

        container.bind(ChatAgentService).toConstantValue(mockAgentService as unknown as ChatAgentService);
        container.bind(ChatRequestParser).toConstantValue(new MockChatRequestParser() as unknown as ChatRequestParser);
        container.bind(AIVariableService).toConstantValue(new MockAIVariableService() as unknown as AIVariableService);
        container.bind(ILogger).toConstantValue(new MockLogger() as unknown as ILogger);

        const contentRegistry = new ChatContentDeserializerRegistryImpl();
        new DefaultChatContentDeserializerContribution().registerDeserializers(contentRegistry);
        container.bind(ChatContentDeserializerRegistry).toConstantValue(contentRegistry);
        container.bind(ChangeSetElementDeserializerRegistry).toConstantValue(new ChangeSetElementDeserializerRegistryImpl());
        container.bind(ChatServiceImpl).toSelf().inSingletonScope();

        chatService = container.get(ChatServiceImpl);
    });

    function createMockSession(pinnedAgent?: ChatAgent, agentLocked?: boolean): ChatSession {
        const session = chatService.createSession(ChatAgentLocation.Panel, { agentLocked });
        if (pinnedAgent) {
            session.pinnedAgent = pinnedAgent;
        }
        return session;
    }

    function createMockRequest(text: string): ChatRequest {
        return { text };
    }

    function createParsedRequestWithMention(agentId: string): ParsedChatRequest {
        const request = createMockRequest(`@${agentId} test`);
        return {
            request,
            parts: [
                new ParsedChatRequestAgentPart({ start: 0, endExclusive: agentId.length + 1 }, agentId, agentId),
                new ParsedChatRequestTextPart({ start: agentId.length + 2, endExclusive: agentId.length + 6 }, 'test')
            ],
            toolRequests: new Map(),
            variables: []
        };
    }

    function createParsedRequestWithoutMention(): ParsedChatRequest {
        const request = createMockRequest('test message');
        return {
            request,
            parts: [
                new ParsedChatRequestTextPart({ start: 0, endExclusive: 12 }, 'test message')
            ],
            toolRequests: new Map(),
            variables: []
        };
    }

    describe('when agentLocked is true', () => {
        it('should return pinned agent and ignore mentioned agent', () => {
            const session = createMockSession(mockPinnedAgent, true);
            const parsedRequest = createParsedRequestWithMention('mentioned-agent');

            const agent = chatService.getAgent(parsedRequest, session);

            expect(agent).to.equal(mockPinnedAgent);
        });

        it('should fall back to mentioned agent if locked agent is no longer available', () => {
            const session = createMockSession(mockPinnedAgent, true);
            mockAgentService.removeAgent('pinned-agent');
            const parsedRequest = createParsedRequestWithMention('mentioned-agent');

            const agent = chatService.getAgent(parsedRequest, session);

            expect(agent).to.equal(mockMentionedAgent);
        });

        it('should fall back to default agent if locked agent is unavailable and no mention', () => {
            const session = createMockSession(mockPinnedAgent, true);
            mockAgentService.removeAgent('pinned-agent');
            const parsedRequest = createParsedRequestWithoutMention();

            const agent = chatService.getAgent(parsedRequest, session);

            // Without a default agent configured, should return undefined
            expect(agent).to.be.undefined;
        });

        it('should return pinned agent even without mention in request', () => {
            const session = createMockSession(mockPinnedAgent, true);
            const parsedRequest = createParsedRequestWithoutMention();

            const agent = chatService.getAgent(parsedRequest, session);

            expect(agent).to.equal(mockPinnedAgent);
        });
    });

    describe('when agentLocked is false or undefined', () => {
        it('should return mentioned agent over pinned agent when not locked', () => {
            const session = createMockSession(mockPinnedAgent, false);
            const parsedRequest = createParsedRequestWithMention('mentioned-agent');

            const agent = chatService.getAgent(parsedRequest, session);

            expect(agent).to.equal(mockMentionedAgent);
        });

        it('should return mentioned agent when agentLocked is undefined', () => {
            const session = createMockSession(mockPinnedAgent, undefined);
            const parsedRequest = createParsedRequestWithMention('mentioned-agent');

            const agent = chatService.getAgent(parsedRequest, session);

            expect(agent).to.equal(mockMentionedAgent);
        });

        it('should return pinned agent when no mention and not locked', () => {
            const session = createMockSession(mockPinnedAgent, false);
            const parsedRequest = createParsedRequestWithoutMention();

            const agent = chatService.getAgent(parsedRequest, session);

            expect(agent).to.equal(mockPinnedAgent);
        });

        it('should return undefined when no pinned agent, no mention, and no default', () => {
            const session = createMockSession(undefined, false);
            const parsedRequest = createParsedRequestWithoutMention();

            const agent = chatService.getAgent(parsedRequest, session);

            expect(agent).to.be.undefined;
        });
    });

    describe('edge cases', () => {
        it('should handle session without pinned agent when locked', () => {
            const session = createMockSession(undefined, true);
            const parsedRequest = createParsedRequestWithMention('mentioned-agent');

            const agent = chatService.getAgent(parsedRequest, session);

            // No pinned agent, so it should fall through to mentioned agent
            expect(agent).to.equal(mockMentionedAgent);
        });

        it('should handle session without pinned agent and no mention when locked', () => {
            const session = createMockSession(undefined, true);
            const parsedRequest = createParsedRequestWithoutMention();

            const agent = chatService.getAgent(parsedRequest, session);

            expect(agent).to.be.undefined;
        });
    });
});
