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
import { Container } from 'inversify';
import { ContributionProvider, ILogger } from '@theia/core';
import { Emitter } from '@theia/core/lib/common';
import { AgentService, AISettings, AISettingsService } from '@theia/ai-core';
import { ChatAgent } from './chat-agents';
import { ChatAgentService, ChatAgentServiceImpl } from './chat-agent-service';

describe('ChatAgentServiceImpl', () => {
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
