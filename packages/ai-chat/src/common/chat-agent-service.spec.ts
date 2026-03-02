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

import 'reflect-metadata';

import { expect } from 'chai';
import * as sinon from 'sinon';
import { Container } from '@theia/core/shared/inversify';
import { ContributionProvider, Emitter, ILogger, PreferenceService } from '@theia/core';
import { AgentService, AISettings, AISettingsService } from '@theia/ai-core';
import { ChatAgent, ChatAgentLocation } from './chat-agents';
import { ChatAgentService, ChatAgentServiceImpl, DefaultChatAgentId, FallbackChatAgentId } from './chat-agent-service';
import { ParsedChatRequest, ParsedChatRequestAgentPart, ParsedChatRequestTextPart } from './parsed-chat-request';
import { DEFAULT_CHAT_AGENT_PREF } from './ai-chat-preferences';

describe('ChatAgentServiceImpl', () => {

    // ---------------------------------------------------------------------------
    // Tests for showInChat filtering (using AISettingsService)
    // ---------------------------------------------------------------------------
    describe('showInChat filtering', () => {
        let container: Container;
        let chatAgentService: ChatAgentServiceImpl;
        let sandbox: sinon.SinonSandbox;

        let mockAgentService: AgentService;
        let mockAISettingsService: AISettingsService;
        let settingsStub: sinon.SinonStub;
        let onDidChangeEmitter: Emitter<void>;
        let mockContributionProvider: { getContributions: sinon.SinonStub };

        // Test agents
        const agent1: ChatAgent = {
            id: 'agent1',
            name: 'Agent 1',
            description: 'Test agent 1',
            variables: [],
            functions: [],
            agentSpecificVariables: [],
            tags: [],
            prompts: [],
            languageModelRequirements: [],
            locations: [],
            invoke: sinon.stub()
        };

        const agent2: ChatAgent = {
            id: 'agent2',
            name: 'Agent 2',
            description: 'Test agent 2',
            variables: [],
            functions: [],
            agentSpecificVariables: [],
            tags: [],
            prompts: [],
            languageModelRequirements: [],
            locations: [],
            invoke: sinon.stub()
        };

        const agent3: ChatAgent = {
            id: 'agent3',
            name: 'Agent 3',
            description: 'Test agent 3',
            variables: [],
            functions: [],
            agentSpecificVariables: [],
            tags: [],
            prompts: [],
            languageModelRequirements: [],
            locations: [],
            invoke: sinon.stub()
        };

        function createContainer(settings: AISettings = {}): Container {
            const testContainer = new Container();

            // Mock AgentService
            mockAgentService = {
                isEnabled: () => true,
                getAgents: () => [],
                getAllAgents: () => [],
                enableAgent: async () => { },
                disableAgent: async () => { },
                registerAgent: () => { },
                unregisterAgent: () => { },
                onDidChangeAgents: new Emitter<void>().event
            };
            testContainer.bind(AgentService).toConstantValue(mockAgentService);

            // Mock AISettingsService with Event
            onDidChangeEmitter = new Emitter<void>();
            settingsStub = sandbox.stub().resolves(settings);
            mockAISettingsService = {
                getSettings: settingsStub,
                getAgentSettings: async () => undefined,
                updateAgentSettings: async () => { },
                onDidChange: onDidChangeEmitter.event
            };
            testContainer.bind(AISettingsService).toConstantValue(mockAISettingsService);

            // Mock ContributionProvider
            mockContributionProvider = {
                getContributions: sandbox.stub().returns([agent1, agent2, agent3])
            };
            testContainer.bind(ContributionProvider).toConstantValue(mockContributionProvider).whenTargetNamed(ChatAgent);

            // Mock Logger
            const mockLogger = {
                debug: sandbox.stub(),
                info: sandbox.stub(),
                warn: sandbox.stub(),
                error: sandbox.stub()
            };
            testContainer.bind(ILogger).toConstantValue(mockLogger as unknown as ILogger);

            // Bind the service under test
            testContainer.bind(ChatAgentService).to(ChatAgentServiceImpl).inSingletonScope();

            return testContainer;
        }

        async function initializeService(settings: AISettings = {}): Promise<void> {
            sandbox = sinon.createSandbox();
            container = createContainer(settings);
            chatAgentService = container.get<ChatAgentServiceImpl>(ChatAgentService);
            // Wait for @postConstruct async initialization
            await settingsStub();
            // Allow promise chain to complete
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        afterEach(() => {
            sandbox.restore();
            onDidChangeEmitter?.dispose();
        });

        describe('getAgents() showInChat filtering', () => {
            it('returns agents when showInChat preference is not set (default = visible)', async () => {
                await initializeService({});

                const agents = chatAgentService.getAgents();

                expect(agents).to.have.lengthOf(3);
                expect(agents.map(a => a.id)).to.include.members(['agent1', 'agent2', 'agent3']);
            });

            it('filters out agents where showInChat preference is false', async () => {
                await initializeService({
                    agent1: { showInChat: false },
                    agent2: { showInChat: false }
                });

                const agents = chatAgentService.getAgents();

                expect(agents).to.have.lengthOf(1);
                expect(agents[0].id).to.equal('agent3');
            });

            it('includes agents where showInChat preference is true', async () => {
                await initializeService({
                    agent1: { showInChat: true },
                    agent2: { showInChat: true },
                    agent3: { showInChat: true }
                });

                const agents = chatAgentService.getAgents();

                expect(agents).to.have.lengthOf(3);
                expect(agents.map(a => a.id)).to.include.members(['agent1', 'agent2', 'agent3']);
            });
        });

        describe('getAllAgents()', () => {
            it('returns all agents regardless of showInChat setting', async () => {
                await initializeService({
                    agent1: { showInChat: false },
                    agent2: { showInChat: false },
                    agent3: { showInChat: false }
                });

                const allAgents = chatAgentService.getAllAgents();

                expect(allAgents).to.have.lengthOf(3);
                expect(allAgents.map(a => a.id)).to.include.members(['agent1', 'agent2', 'agent3']);
            });
        });

        describe('onDidChange updates', () => {
            it('updates filtered list when AISettingsService.onDidChange fires', async () => {
                // Start with agent1 hidden
                await initializeService({
                    agent1: { showInChat: false }
                });

                let agents = chatAgentService.getAgents();
                expect(agents).to.have.lengthOf(2);
                expect(agents.map(a => a.id)).to.not.include('agent1');

                // Update settings to show agent1 and hide agent2
                settingsStub.resolves({
                    agent2: { showInChat: false }
                });

                // Fire the change event
                onDidChangeEmitter.fire();

                // Wait for async update
                await settingsStub();
                await new Promise(resolve => setTimeout(resolve, 0));

                agents = chatAgentService.getAgents();
                expect(agents).to.have.lengthOf(2);
                expect(agents.map(a => a.id)).to.include('agent1');
                expect(agents.map(a => a.id)).to.not.include('agent2');
            });
        });
    });

    // ---------------------------------------------------------------------------
    // Tests for agent resolution (resolveAgent, getDefaultAgent, etc.)
    // ---------------------------------------------------------------------------
    describe('agent resolution', () => {
        let service: ChatAgentServiceImpl;
        let container: Container;
        let mockAgentService: MockAgentService;

        const createMockAgent = (id: string, name: string): ChatAgent => ({
            id,
            name,
            description: `Test agent: ${name}`,
            locations: [ChatAgentLocation.Panel],
            invoke: async () => { },
            languageModelRequirements: [],
            tags: [],
            variables: [],
            agentSpecificVariables: [],
            functions: [],
            prompts: []
        });

        const mockDefaultAgent = createMockAgent('default-agent', 'Default Agent');
        const mockFallbackAgent = createMockAgent('fallback-agent', 'Fallback Agent');
        const mockMentionedAgent = createMockAgent('mentioned-agent', 'Mentioned Agent');
        const mockDisabledAgent = createMockAgent('disabled-agent', 'Disabled Agent');

        class MockAgentService {
            private disabledAgents = new Set<string>();

            isEnabled(id: string): boolean {
                return !this.disabledAgents.has(id);
            }

            disableAgent(id: string): void {
                this.disabledAgents.add(id);
            }

            enableAgent(id: string): void {
                this.disabledAgents.delete(id);
            }
        }

        class MockContributionProvider {
            getContributions(): ChatAgent[] {
                return [mockMentionedAgent, mockDisabledAgent];
            }
        }

        class MockLogger {
            error(): void { }
            warn(): void { }
            info(): void { }
            debug(): void { }
        }

        class MockPreferenceService {
            private preferences = new Map<string, unknown>();
            private readonly onPreferenceChangedEmitter = new Emitter<{ preferenceName: string; newValue: unknown }>();
            readonly onPreferenceChanged = this.onPreferenceChangedEmitter.event;

            get<T>(preferenceName: string, defaultValue?: T): T {
                if (this.preferences.has(preferenceName)) {
                    return this.preferences.get(preferenceName) as T;
                }
                return defaultValue as T;
            }

            set(preferenceName: string, value: unknown): void {
                this.preferences.set(preferenceName, value);
                this.onPreferenceChangedEmitter.fire({ preferenceName, newValue: value });
            }

            clear(preferenceName: string): void {
                this.preferences.delete(preferenceName);
                this.onPreferenceChangedEmitter.fire({ preferenceName, newValue: undefined });
            }
        }

        function createParsedRequest(text: string, agentId?: string): ParsedChatRequest {
            const parts = agentId
                ? [
                    new ParsedChatRequestAgentPart({ start: 0, endExclusive: agentId.length + 1 }, agentId, agentId),
                    new ParsedChatRequestTextPart({ start: agentId.length + 2, endExclusive: text.length }, text.substring(agentId.length + 2))
                ]
                : [
                    new ParsedChatRequestTextPart({ start: 0, endExclusive: text.length }, text)
                ];

            return {
                request: { text },
                parts,
                toolRequests: new Map(),
                variables: []
            };
        }

        beforeEach(() => {
            container = new Container();
            mockAgentService = new MockAgentService();

            container.bind(AgentService).toConstantValue(mockAgentService as unknown as AgentService);
            container.bind(ILogger).toConstantValue(new MockLogger() as unknown as ILogger);
            container.bind(ContributionProvider).toConstantValue(new MockContributionProvider()).whenTargetNamed(ChatAgent);
            container.bind(ChatAgentServiceImpl).toSelf().inSingletonScope();
        });

        afterEach(() => {
            // Reset mock state to prevent test interdependencies
            mockAgentService = new MockAgentService();
        });

        describe('resolveAgent', () => {
            it('should return explicitly mentioned agent', () => {
                service = container.get(ChatAgentServiceImpl);
                const parsedRequest = createParsedRequest('@mentioned-agent test', 'mentioned-agent');

                const agent = service.resolveAgent(parsedRequest);

                expect(agent).to.equal(mockMentionedAgent);
            });

            it('should return default agent when no explicit mention and default is configured', () => {
                container.bind(DefaultChatAgentId).toConstantValue({ id: 'default-agent' });
                service = container.get(ChatAgentServiceImpl);
                service.registerChatAgent(mockDefaultAgent);
                const parsedRequest = createParsedRequest('test message');

                const agent = service.resolveAgent(parsedRequest);

                expect(agent).to.equal(mockDefaultAgent);
            });

            it('should return fallback agent when no explicit mention and no default configured', () => {
                container.bind(FallbackChatAgentId).toConstantValue({ id: 'fallback-agent' });
                service = container.get(ChatAgentServiceImpl);
                service.registerChatAgent(mockFallbackAgent);
                const parsedRequest = createParsedRequest('test message');

                const agent = service.resolveAgent(parsedRequest);

                expect(agent).to.equal(mockFallbackAgent);
            });

            it('should return undefined when no agent can be resolved', () => {
                service = container.get(ChatAgentServiceImpl);
                const parsedRequest = createParsedRequest('test message');

                const agent = service.resolveAgent(parsedRequest);

                expect(agent).to.be.undefined;
            });

            it('should return undefined for disabled agents when mentioned', () => {
                service = container.get(ChatAgentServiceImpl);
                mockAgentService.disableAgent('disabled-agent');
                const parsedRequest = createParsedRequest('@disabled-agent test', 'disabled-agent');

                const agent = service.resolveAgent(parsedRequest);

                expect(agent).to.be.undefined;
            });

            it('should return undefined when default agent is disabled', () => {
                container.bind(DefaultChatAgentId).toConstantValue({ id: 'disabled-agent' });
                service = container.get(ChatAgentServiceImpl);
                mockAgentService.disableAgent('disabled-agent');
                const parsedRequest = createParsedRequest('test message');

                const agent = service.resolveAgent(parsedRequest);

                expect(agent).to.be.undefined;
            });

            it('should fall back to fallback agent when default agent is disabled', () => {
                container.bind(DefaultChatAgentId).toConstantValue({ id: 'disabled-agent' });
                container.bind(FallbackChatAgentId).toConstantValue({ id: 'fallback-agent' });
                service = container.get(ChatAgentServiceImpl);
                service.registerChatAgent(mockFallbackAgent);
                mockAgentService.disableAgent('disabled-agent');
                const parsedRequest = createParsedRequest('test message');

                const agent = service.resolveAgent(parsedRequest);

                expect(agent).to.equal(mockFallbackAgent);
            });
        });

        describe('getDefaultAgent', () => {
            it('should return agent when DefaultChatAgentId is bound and agent exists', () => {
                container.bind(DefaultChatAgentId).toConstantValue({ id: 'default-agent' });
                service = container.get(ChatAgentServiceImpl);
                service.registerChatAgent(mockDefaultAgent);

                const agent = service.getDefaultAgent();

                expect(agent).to.equal(mockDefaultAgent);
            });

            it('should return undefined when DefaultChatAgentId is not bound', () => {
                service = container.get(ChatAgentServiceImpl);

                const agent = service.getDefaultAgent();

                expect(agent).to.be.undefined;
            });

            it('should return undefined when bound agent ID does not exist', () => {
                container.bind(DefaultChatAgentId).toConstantValue({ id: 'non-existent-agent' });
                service = container.get(ChatAgentServiceImpl);

                const agent = service.getDefaultAgent();

                expect(agent).to.be.undefined;
            });

            it('should return undefined when bound agent is disabled', () => {
                container.bind(DefaultChatAgentId).toConstantValue({ id: 'disabled-agent' });
                service = container.get(ChatAgentServiceImpl);
                mockAgentService.disableAgent('disabled-agent');

                const agent = service.getDefaultAgent();

                expect(agent).to.be.undefined;
            });
        });

        describe('getFallbackAgent', () => {
            it('should return agent when FallbackChatAgentId is bound and agent exists', () => {
                container.bind(FallbackChatAgentId).toConstantValue({ id: 'fallback-agent' });
                service = container.get(ChatAgentServiceImpl);
                service.registerChatAgent(mockFallbackAgent);

                const agent = service.getFallbackAgent();

                expect(agent).to.equal(mockFallbackAgent);
            });

            it('should return undefined when FallbackChatAgentId is not bound', () => {
                service = container.get(ChatAgentServiceImpl);

                const agent = service.getFallbackAgent();

                expect(agent).to.be.undefined;
            });

            it('should return undefined when bound agent ID does not exist', () => {
                container.bind(FallbackChatAgentId).toConstantValue({ id: 'non-existent-agent' });
                service = container.get(ChatAgentServiceImpl);

                const agent = service.getFallbackAgent();

                expect(agent).to.be.undefined;
            });

            it('should return undefined when bound agent is disabled', () => {
                container.bind(FallbackChatAgentId).toConstantValue({ id: 'disabled-agent' });
                service = container.get(ChatAgentServiceImpl);
                mockAgentService.disableAgent('disabled-agent');

                const agent = service.getFallbackAgent();

                expect(agent).to.be.undefined;
            });
        });

        describe('onDidChangeAgents', () => {
            it('should fire when an agent is registered', () => {
                service = container.get(ChatAgentServiceImpl);
                let eventFired = false;
                service.onDidChangeAgents(() => {
                    eventFired = true;
                });

                service.registerChatAgent(mockDefaultAgent);

                expect(eventFired).to.be.true;
            });

            it('should fire when an agent is unregistered', () => {
                service = container.get(ChatAgentServiceImpl);
                service.registerChatAgent(mockDefaultAgent);
                let eventFired = false;
                service.onDidChangeAgents(() => {
                    eventFired = true;
                });

                service.unregisterChatAgent('default-agent');

                expect(eventFired).to.be.true;
            });

            it('should fire multiple times for multiple registrations', () => {
                service = container.get(ChatAgentServiceImpl);
                let fireCount = 0;
                service.onDidChangeAgents(() => {
                    fireCount++;
                });

                service.registerChatAgent(mockDefaultAgent);
                service.registerChatAgent(mockFallbackAgent);

                expect(fireCount).to.equal(2);
            });
        });

        describe('getAgents and getAllAgents', () => {
            it('should only return enabled agents from getAgents', () => {
                service = container.get(ChatAgentServiceImpl);
                mockAgentService.disableAgent('disabled-agent');

                const agents = service.getAgents();

                expect(agents.map(a => a.id)).to.not.include('disabled-agent');
                expect(agents.map(a => a.id)).to.include('mentioned-agent');
            });

            it('should return all agents including disabled from getAllAgents', () => {
                service = container.get(ChatAgentServiceImpl);
                mockAgentService.disableAgent('disabled-agent');

                const agents = service.getAllAgents();

                expect(agents.map(a => a.id)).to.include('disabled-agent');
                expect(agents.map(a => a.id)).to.include('mentioned-agent');
            });
        });

        describe('getPreferenceDefaultAgent', () => {
            let mockPreferenceService: MockPreferenceService;
            const mockPreferenceAgent = createMockAgent('preference-agent', 'Preference Agent');

            beforeEach(() => {
                mockPreferenceService = new MockPreferenceService();
                container.bind(PreferenceService).toConstantValue(mockPreferenceService as unknown as PreferenceService);
            });

            it('should return agent when preference is set and agent exists', () => {
                service = container.get(ChatAgentServiceImpl);
                service.registerChatAgent(mockPreferenceAgent);
                mockPreferenceService.set(DEFAULT_CHAT_AGENT_PREF, 'preference-agent');

                const agent = service.getPreferenceDefaultAgent();

                expect(agent).to.equal(mockPreferenceAgent);
            });

            it('should return undefined when preference is not set', () => {
                service = container.get(ChatAgentServiceImpl);

                const agent = service.getPreferenceDefaultAgent();

                expect(agent).to.be.undefined;
            });

            it('should return undefined when preference agent does not exist', () => {
                service = container.get(ChatAgentServiceImpl);
                mockPreferenceService.set(DEFAULT_CHAT_AGENT_PREF, 'non-existent-agent');

                const agent = service.getPreferenceDefaultAgent();

                expect(agent).to.be.undefined;
            });

            it('should return undefined when preference agent is disabled', () => {
                service = container.get(ChatAgentServiceImpl);
                mockPreferenceService.set(DEFAULT_CHAT_AGENT_PREF, 'disabled-agent');
                mockAgentService.disableAgent('disabled-agent');

                const agent = service.getPreferenceDefaultAgent();

                expect(agent).to.be.undefined;
            });

            it('should return undefined when PreferenceService is not available', () => {
                const containerWithoutPrefs = new Container();
                containerWithoutPrefs.bind(AgentService).toConstantValue(mockAgentService as unknown as AgentService);
                containerWithoutPrefs.bind(ILogger).toConstantValue(new MockLogger() as unknown as ILogger);
                containerWithoutPrefs.bind(ContributionProvider).toConstantValue(new MockContributionProvider()).whenTargetNamed(ChatAgent);
                containerWithoutPrefs.bind(ChatAgentServiceImpl).toSelf().inSingletonScope();

                const serviceWithoutPrefs = containerWithoutPrefs.get(ChatAgentServiceImpl);

                const agent = serviceWithoutPrefs.getPreferenceDefaultAgent();

                expect(agent).to.be.undefined;
            });
        });

        describe('getEffectiveDefaultAgent', () => {
            let mockPreferenceService: MockPreferenceService;
            const mockPreferenceAgent = createMockAgent('preference-agent', 'Preference Agent');

            beforeEach(() => {
                mockPreferenceService = new MockPreferenceService();
                container.bind(PreferenceService).toConstantValue(mockPreferenceService as unknown as PreferenceService);
            });

            it('should return preference agent when both preference and DI default are set', () => {
                container.bind(DefaultChatAgentId).toConstantValue({ id: 'default-agent' });
                service = container.get(ChatAgentServiceImpl);
                service.registerChatAgent(mockDefaultAgent);
                service.registerChatAgent(mockPreferenceAgent);
                mockPreferenceService.set(DEFAULT_CHAT_AGENT_PREF, 'preference-agent');

                const agent = service.getEffectiveDefaultAgent();

                expect(agent).to.equal(mockPreferenceAgent);
            });

            it('should return DI default when preference is not set', () => {
                container.bind(DefaultChatAgentId).toConstantValue({ id: 'default-agent' });
                service = container.get(ChatAgentServiceImpl);
                service.registerChatAgent(mockDefaultAgent);

                const agent = service.getEffectiveDefaultAgent();

                expect(agent).to.equal(mockDefaultAgent);
            });

            it('should return DI default when preference agent does not exist', () => {
                container.bind(DefaultChatAgentId).toConstantValue({ id: 'default-agent' });
                service = container.get(ChatAgentServiceImpl);
                service.registerChatAgent(mockDefaultAgent);
                mockPreferenceService.set(DEFAULT_CHAT_AGENT_PREF, 'non-existent-agent');

                const agent = service.getEffectiveDefaultAgent();

                expect(agent).to.equal(mockDefaultAgent);
            });

            it('should return undefined when neither preference nor DI default is available', () => {
                service = container.get(ChatAgentServiceImpl);

                const agent = service.getEffectiveDefaultAgent();

                expect(agent).to.be.undefined;
            });
        });

        describe('resolveAgent with preference', () => {
            let mockPreferenceService: MockPreferenceService;
            const mockPreferenceAgent = createMockAgent('preference-agent', 'Preference Agent');

            beforeEach(() => {
                mockPreferenceService = new MockPreferenceService();
                container.bind(PreferenceService).toConstantValue(mockPreferenceService as unknown as PreferenceService);
            });

            it('should return preference agent over DI default when no explicit mention', () => {
                container.bind(DefaultChatAgentId).toConstantValue({ id: 'default-agent' });
                service = container.get(ChatAgentServiceImpl);
                service.registerChatAgent(mockDefaultAgent);
                service.registerChatAgent(mockPreferenceAgent);
                mockPreferenceService.set(DEFAULT_CHAT_AGENT_PREF, 'preference-agent');
                const parsedRequest = createParsedRequest('test message');

                const agent = service.resolveAgent(parsedRequest);

                expect(agent).to.equal(mockPreferenceAgent);
            });

            it('should fall back to fallback agent when preference agent is disabled', () => {
                container.bind(FallbackChatAgentId).toConstantValue({ id: 'fallback-agent' });
                service = container.get(ChatAgentServiceImpl);
                service.registerChatAgent(mockFallbackAgent);
                service.registerChatAgent(mockPreferenceAgent);
                mockPreferenceService.set(DEFAULT_CHAT_AGENT_PREF, 'preference-agent');
                mockAgentService.disableAgent('preference-agent');
                const parsedRequest = createParsedRequest('test message');

                const agent = service.resolveAgent(parsedRequest);

                expect(agent).to.equal(mockFallbackAgent);
            });
        });

        describe('onDefaultAgentChanged', () => {
            let mockPreferenceService: MockPreferenceService;
            const mockPreferenceAgent = createMockAgent('preference-agent', 'Preference Agent');

            beforeEach(() => {
                mockPreferenceService = new MockPreferenceService();
                container.bind(PreferenceService).toConstantValue(mockPreferenceService as unknown as PreferenceService);
            });

            it('should fire when preference changes', () => {
                service = container.get(ChatAgentServiceImpl);
                service.registerChatAgent(mockPreferenceAgent);
                let eventFired = false;
                let receivedAgent: ChatAgent | undefined;
                service.onDefaultAgentChanged(agent => {
                    eventFired = true;
                    receivedAgent = agent;
                });

                mockPreferenceService.set(DEFAULT_CHAT_AGENT_PREF, 'preference-agent');

                expect(eventFired).to.be.true;
                expect(receivedAgent).to.equal(mockPreferenceAgent);
            });

            it('should fire when preference is cleared', () => {
                service = container.get(ChatAgentServiceImpl);
                service.registerChatAgent(mockPreferenceAgent);
                mockPreferenceService.set(DEFAULT_CHAT_AGENT_PREF, 'preference-agent');
                let eventFired = false;
                let receivedAgent: ChatAgent | undefined = mockPreferenceAgent;
                service.onDefaultAgentChanged(agent => {
                    eventFired = true;
                    receivedAgent = agent;
                });

                mockPreferenceService.clear(DEFAULT_CHAT_AGENT_PREF);

                expect(eventFired).to.be.true;
                expect(receivedAgent).to.be.undefined;
            });

            it('should fire when agents change', () => {
                service = container.get(ChatAgentServiceImpl);
                let fireCount = 0;
                service.onDefaultAgentChanged(() => {
                    fireCount++;
                });

                service.registerChatAgent(mockPreferenceAgent);

                expect(fireCount).to.equal(1);
            });

            it('should provide effective default when agents change and preference is set', () => {
                service = container.get(ChatAgentServiceImpl);
                mockPreferenceService.set(DEFAULT_CHAT_AGENT_PREF, 'preference-agent');
                let receivedAgent: ChatAgent | undefined;
                service.onDefaultAgentChanged(agent => {
                    receivedAgent = agent;
                });

                service.registerChatAgent(mockPreferenceAgent);

                expect(receivedAgent).to.equal(mockPreferenceAgent);
            });
        });
    });
});
