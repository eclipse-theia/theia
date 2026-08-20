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

import { enableJSDOM, enableReactActEnvironment } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
let disableReactActEnvironment = enableReactActEnvironment();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import * as React from '@theia/core/shared/react';
import { MessageLoop } from '@theia/core/shared/@lumino/messaging';

import { Emitter, URI } from '@theia/core';

import { OpenHandler, OpenerService } from '@theia/core/lib/browser';
import { Skill } from '@theia/ai-core/lib/common/skill';
import { SkillService } from '@theia/ai-core/lib/browser/skill-service';
import { AgentPluginUiBridge, InstalledAgentPluginInfo } from '@theia/ai-core/lib/browser/agent-plugin-ui-bridge';
import { PromptFragment, PromptService } from '@theia/ai-core/lib/common/prompt-service';
import { Agent, AgentService } from '@theia/ai-core';

import { AISkillsConfigurationWidget } from './skills-configuration-widget';

disableReactActEnvironment();
disableJSDOM();

describe('AISkillsConfigurationWidget', () => {
    let host: HTMLElement;
    let widgets: AISkillsConfigurationWidget[];
    /** Records the plugin ids the widget asked to reveal, so a test can assert on the reveal action. */
    let revealedPluginIds: string[];

    before(() => {
        disableJSDOM = enableJSDOM();
        disableReactActEnvironment = enableReactActEnvironment();
    });

    after(() => {
        disableReactActEnvironment();
        disableJSDOM();
    });

    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
        widgets = [];
        revealedPluginIds = [];
    });

    afterEach(() => {
        React.act(() => {
            for (const widget of widgets) {
                widget.dispose();
            }
        });
        host.remove();
    });

    function renderWidget(widget: AISkillsConfigurationWidget): void {
        React.act(() => {
            widget.update();
            MessageLoop.flush();
        });
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

    /** A plugin as the bridge knows it, plus the qualifier its contributed skill root carries. */
    type InstalledPlugin = InstalledAgentPluginInfo & { qualifier: string };

    function createMockAgentPluginUiBridge(plugins: InstalledPlugin[] = []): AgentPluginUiBridge {
        const onDidChangeEmitter = new Emitter<void>();
        return {
            getPlugin: (pluginId: string) => plugins.find(plugin => plugin.pluginId === pluginId),
            getPluginByQualifier: (qualifier: string) => plugins.find(plugin => plugin.qualifier === qualifier),
            revealPlugin: (pluginId: string) => { revealedPluginIds.push(pluginId); },
            onDidChange: onDidChangeEmitter.event
        };
    }

    function createWidget(
        skills: Skill[] = [],
        commands: PromptFragment[] = [],
        agents: Agent[] = [],
        openerService?: Partial<OpenerService>,
        installedPlugins?: InstalledPlugin[]
    ): AISkillsConfigurationWidget {
        const widget = new AISkillsConfigurationWidget();
        (widget as unknown as { skillService: SkillService }).skillService = createMockSkillService(skills) as SkillService;
        (widget as unknown as { promptService: PromptService }).promptService = createMockPromptService(commands) as PromptService;
        (widget as unknown as { agentService: AgentService }).agentService = createMockAgentService(agents) as AgentService;
        (widget as unknown as { openerService: OpenerService }).openerService = (openerService ?? {}) as OpenerService;
        // Left unset when no plugins are passed, so the default is the `@theia/ai-registry`-less product.
        if (installedPlugins) {
            (widget as unknown as { agentPluginUiBridge: AgentPluginUiBridge }).agentPluginUiBridge = createMockAgentPluginUiBridge(installedPlugins);
        }
        (widget as unknown as { init: () => void }).init();
        host.appendChild(widget.node);
        widgets.push(widget);
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
            { name: 'Skill A', qualifiedName: 'Skill A', description: 'Desc A', location: '/path/a' } as Skill,
            { name: 'Skill B', qualifiedName: 'Skill B', description: 'Desc B', location: '/path/b' } as Skill
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
            { name: 'Skill A', qualifiedName: 'Skill A', description: 'Desc A', location: '/path/a' } as Skill
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

    it('renders no plugin provenance for a skill that does not come from a plugin', () => {
        const skills: Skill[] = [
            { name: 'Skill A', qualifiedName: 'Skill A', description: 'Desc A', location: '/path/a' } as Skill
        ];

        const widget = createWidget(skills);
        renderWidget(widget);

        expect(host.querySelector('.ai-skill-plugin-origin')).to.be.null;
    });

    it('renders the qualified name and a "via <plugin>" affordance for a skill owned by a plugin', () => {
        const skills: Skill[] = [
            {
                name: 'query-builder',
                qualifiedName: 'bigquery:query-builder',
                description: 'Build SQL',
                location: '/plugins/bigquery/skills/query-builder/SKILL.md'
            } as Skill
        ];
        const installed: InstalledPlugin[] = [{ pluginId: 'io.example/bq', name: 'BigQuery Data Analytics', qualifier: 'bigquery' }];

        const widget = createWidget(skills, [], [], undefined, installed);
        renderWidget(widget);

        // Scoped to the body: the header cell carries the same class and comes first in document order.
        const nameColumn = host.querySelector('tbody tr .skill-name-column');
        expect(nameColumn?.textContent).to.contain('bigquery:query-builder');
        // The name comes from the bridge; the skill itself only carries the qualifier.
        expect(nameColumn?.querySelector('.ai-skill-plugin-origin')?.textContent).to.contain('BigQuery Data Analytics');
    });

    it('renders no affordance when the qualifier belongs to no installed plugin, rather than a bare qualifier', () => {
        const skills: Skill[] = [
            {
                name: 'query-builder',
                qualifiedName: 'bigquery:query-builder',
                description: 'Build SQL',
                location: '/plugins/bigquery/skills/query-builder/SKILL.md'
            } as Skill
        ];

        const widget = createWidget(skills, [], [], undefined, []);
        renderWidget(widget);

        expect(host.querySelector('tbody tr .skill-name-column')?.textContent).to.contain('bigquery:query-builder');
        expect(host.querySelector('.ai-skill-plugin-origin')).to.be.null;
    });

    it('renders no affordance when no bridge is bound, i.e. without `@theia/ai-registry`', () => {
        const skills: Skill[] = [
            {
                name: 'query-builder',
                qualifiedName: 'bigquery:query-builder',
                description: 'Build SQL',
                location: '/plugins/bigquery/skills/query-builder/SKILL.md'
            } as Skill
        ];

        const widget = createWidget(skills);
        renderWidget(widget);

        expect(host.querySelector('.ai-skill-plugin-origin')).to.be.null;
    });

    it('clicking the "via <plugin>" affordance reveals the owning plugin', () => {
        const skills: Skill[] = [
            {
                name: 'query-builder',
                qualifiedName: 'bigquery:query-builder',
                description: 'Build SQL',
                location: '/plugins/bigquery/skills/query-builder/SKILL.md'
            } as Skill
        ];
        const installed: InstalledPlugin[] = [{ pluginId: 'io.example/bq', name: 'BigQuery', qualifier: 'bigquery' }];

        const widget = createWidget(skills, [], [], undefined, installed);
        renderWidget(widget);

        const origin = host.querySelector('.ai-skill-plugin-origin') as HTMLButtonElement;
        expect(origin).to.not.be.null;
        React.act(() => origin.click());

        expect(revealedPluginIds).to.deep.equal(['io.example/bq']);
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

        // Commands are sorted alphabetically by name: 'help' comes before 'test'
        expect(rows[0].querySelector('.slash-command-name-column')?.textContent).to.contain('/help');
        expect(rows[0].querySelector('.slash-command-description-column')?.textContent).to.contain('Help command');

        expect(rows[1].querySelector('.slash-command-name-column')?.textContent).to.contain('/test');
        expect(rows[1].querySelector('.slash-command-description-column')?.textContent).to.contain('Test command');
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
