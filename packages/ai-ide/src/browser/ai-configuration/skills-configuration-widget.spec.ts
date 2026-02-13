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
import * as React from '@theia/core/shared/react';
import * as ReactDOM from '@theia/core/shared/react-dom';

import { Emitter, URI } from '@theia/core';

import { OpenHandler, OpenerService } from '@theia/core/lib/browser';
import { Skill } from '@theia/ai-core/lib/common/skill';
import { SkillService } from '@theia/ai-core/lib/browser/skill-service';
import { PromptFragment, PromptService } from '@theia/ai-core/lib/common/prompt-service';
import { Agent, AgentService } from '@theia/ai-core';

import { AISkillsConfigurationWidget } from './skills-configuration-widget';

disableJSDOM();

describe('AISkillsConfigurationWidget', () => {
    let host: HTMLElement;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
    });

    afterEach(() => {
        ReactDOM.unmountComponentAtNode(host);
        host.remove();
    });

    function renderWidget(widget: AISkillsConfigurationWidget): void {
        const element = (widget as unknown as { render: () => React.ReactNode }).render();
        ReactDOM.render(element as React.ReactElement, host);
    }

    function createMockSkillService(skills: Skill[] = []): Partial<SkillService> {
        const onSkillsChangedEmitter = new Emitter<void>();
        return {
            getSkills: () => skills,
            onSkillsChanged: onSkillsChangedEmitter.event
        };
    }

    function createMockPromptService(commands: PromptFragment[] = []): Partial<PromptService> {
        const onPromptsChangeEmitter = new Emitter<void>();
        return {
            getCommands: () => commands,
            onPromptsChange: onPromptsChangeEmitter.event
        };
    }

    function createMockAgentService(agents: Agent[] = []): Partial<AgentService> {
        const onDidChangeAgentsEmitter = new Emitter<void>();
        return {
            getAllAgents: () => agents,
            onDidChangeAgents: onDidChangeAgentsEmitter.event
        };
    }

    function createWidget(
        skills: Skill[] = [],
        commands: PromptFragment[] = [],
        agents: Agent[] = [],
        openerService?: Partial<OpenerService>
    ): AISkillsConfigurationWidget {
        const widget = new AISkillsConfigurationWidget();
        (widget as unknown as { skillService: SkillService }).skillService = createMockSkillService(skills) as SkillService;
        (widget as unknown as { promptService: PromptService }).promptService = createMockPromptService(commands) as PromptService;
        (widget as unknown as { agentService: AgentService }).agentService = createMockAgentService(agents) as AgentService;
        (widget as unknown as { openerService: OpenerService }).openerService = (openerService ?? {}) as OpenerService;
        (widget as unknown as { init: () => void }).init();
        return widget;
    }

    // --- Skills section tests ---

    it('renders empty state when no skills are available', () => {
        const widget = createWidget();
        renderWidget(widget);

        const skillsSection = host.querySelector('.ai-skills-section');
        expect(skillsSection).to.not.be.null;

        const emptyState = skillsSection!.querySelector('.ai-empty-state-content');
        expect(emptyState).to.not.be.null;
    });

    it('renders multiple skills with correct name/description/location', () => {
        const skills: Skill[] = [
            { name: 'Skill A', description: 'Desc A', location: '/path/a' } as Skill,
            { name: 'Skill B', description: 'Desc B', location: '/path/b' } as Skill
        ];

        const widget = createWidget(skills);
        renderWidget(widget);

        const skillsSection = host.querySelector('.ai-skills-section');
        expect(skillsSection).to.not.be.null;

        const rows = Array.from(skillsSection!.querySelectorAll('tbody tr'));
        expect(rows.length).to.equal(2);

        expect(rows[0].querySelector('.skill-name-column')?.textContent).to.contain('Skill A');
        expect(rows[0].querySelector('.skill-description-column')?.textContent).to.contain('Desc A');
        expect(rows[0].querySelector('.skill-location-column')?.textContent).to.contain('/path/a');

        expect(rows[1].querySelector('.skill-name-column')?.textContent).to.contain('Skill B');
        expect(rows[1].querySelector('.skill-description-column')?.textContent).to.contain('Desc B');
        expect(rows[1].querySelector('.skill-location-column')?.textContent).to.contain('/path/b');
    });

    it('clicking "Open" calls opener with URI.fromFilePath(skill.location)', async () => {
        const skills: Skill[] = [
            { name: 'Skill A', description: 'Desc A', location: '/path/a' } as Skill
        ];

        let openedUri: URI | undefined;
        const opener: OpenHandler = {
            id: 'test-opener',
            canHandle: async () => 1,
            open: async (uri: URI) => { openedUri = uri; }
        };
        const openerService: Partial<OpenerService> = {
            getOpener: async () => opener,
            getOpeners: async () => [opener]
        };

        const widget = createWidget(skills, [], [], openerService);
        renderWidget(widget);

        const button = host.querySelector('button[title="Open"]');
        expect(button).to.not.be.null;

        (button as HTMLButtonElement).click();
        await Promise.resolve();

        expect(openedUri?.toString()).to.equal(URI.fromFilePath('/path/a').toString());
    });

    // --- Slash commands section tests ---

    it('renders slash commands section when commands are available', () => {
        const commands: PromptFragment[] = [
            { id: 'cmd1', template: '', isCommand: true, commandName: 'test', commandDescription: 'Test command' },
            { id: 'cmd2', template: '', isCommand: true, commandName: 'help', commandDescription: 'Help command' }
        ];

        const widget = createWidget([], commands);
        renderWidget(widget);

        const slashCommandsSection = host.querySelector('.ai-slash-commands-section');
        expect(slashCommandsSection).to.not.be.null;

        const rows = Array.from(slashCommandsSection!.querySelectorAll('tbody tr'));
        expect(rows.length).to.equal(2);

        expect(rows[0].querySelector('.slash-command-name-column')?.textContent).to.contain('/test');
        expect(rows[0].querySelector('.slash-command-description-column')?.textContent).to.contain('Test command');

        expect(rows[1].querySelector('.slash-command-name-column')?.textContent).to.contain('/help');
        expect(rows[1].querySelector('.slash-command-description-column')?.textContent).to.contain('Help command');
    });

    it('renders empty state for slash commands when none are available', () => {
        const widget = createWidget();
        renderWidget(widget);

        const slashCommandsSection = host.querySelector('.ai-slash-commands-section');
        expect(slashCommandsSection).to.not.be.null;

        const emptyState = slashCommandsSection!.querySelector('.ai-empty-state-content');
        expect(emptyState).to.not.be.null;
    });

    it('shows "All agents" when command has no specific agents', () => {
        const commands: PromptFragment[] = [
            { id: 'cmd1', template: '', isCommand: true, commandName: 'global', commandDescription: 'Global command' }
        ];

        const widget = createWidget([], commands);
        renderWidget(widget);

        const allAgentsText = host.querySelector('.slash-command-all-agents');
        expect(allAgentsText).to.not.be.null;
    });

    it('shows agent chips when command is restricted to specific agents', () => {
        const agents: Agent[] = [
            { id: 'agent1', name: 'Agent One', description: 'Test agent 1', variables: [], functions: [], prompts: [], agentSpecificVariables: [], languageModelRequirements: [] },
            { id: 'agent2', name: 'Agent Two', description: 'Test agent 2', variables: [], functions: [], prompts: [], agentSpecificVariables: [], languageModelRequirements: [] }
        ];

        const commands: PromptFragment[] = [
            { id: 'cmd1', template: '', isCommand: true, commandName: 'specific', commandDescription: 'Agent-specific command', commandAgents: ['agent1'] }
        ];

        const widget = createWidget([], commands, agents);
        renderWidget(widget);

        const agentChips = host.querySelectorAll('.agent-chip');
        expect(agentChips.length).to.equal(1);
        expect(agentChips[0].textContent).to.contain('Agent One');
    });
});
