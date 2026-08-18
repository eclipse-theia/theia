// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import { Event } from '@theia/core';
import * as React from '@theia/core/shared/react';
import { createRoot } from '@theia/core/shared/react-dom/client';
import { flushSync } from '@theia/core/shared/react-dom';
import { PromptFragment } from '@theia/ai-core/lib/common/prompt-service';
import { Skill } from '@theia/ai-core/lib/common/skill';
import { AgentPluginUiBridge, InstalledAgentPluginInfo } from '@theia/ai-core/lib/browser/agent-plugin-ui-bridge';
import { AiConfigurationCategoryId } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { CollapsibleRow } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/collapsible-list';
import { PromptsAndSkillsConfigurationCategory } from './prompts-and-skills-configuration-category';

disableJSDOM();

/** A plugin as the bridge knows it, plus the qualifier its contributed skill root carries. */
type InstalledPlugin = InstalledAgentPluginInfo & { qualifier: string };

describe('PromptsAndSkillsConfigurationCategory', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    function categoryWith(skills: Skill[], slashCommands: PromptFragment[]): PromptsAndSkillsConfigurationCategory {
        const category = new PromptsAndSkillsConfigurationCategory();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).skills = skills;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).slashCommands = slashCommands;
        return category;
    }

    /** Leaves the bridge unbound when `installedPlugins` is omitted, i.e. a product without `@theia/ai-registry`. */
    function categoryWithPlugins(skills: Skill[], installedPlugins: InstalledPlugin[] | undefined, revealed: string[] = []): PromptsAndSkillsConfigurationCategory {
        const category = categoryWith(skills, []);
        if (installedPlugins) {
            const bridge: AgentPluginUiBridge = {
                getPlugin: pluginId => installedPlugins.find(plugin => plugin.pluginId === pluginId),
                getPluginByQualifier: qualifier => installedPlugins.find(plugin => plugin.qualifier === qualifier),
                revealPlugin: pluginId => { revealed.push(pluginId); },
                onDidChange: Event.None
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (category as any).agentPluginUiBridge = bridge;
        }
        return category;
    }

    function skillRow(category: PromptsAndSkillsConfigurationCategory, forSkill: Skill): CollapsibleRow {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (category as any).buildSkillRow(forSkill) as CollapsibleRow;
    }

    /** Renders a row's action slot and clicks the action whose accessible name starts with `titlePrefix`. */
    function clickRowAction(actions: React.ReactNode, titlePrefix: string): void {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        try {
            flushSync(() => root.render(actions));
            const button = container.querySelector(`button[aria-label^="${titlePrefix}"]`) as HTMLButtonElement | null;
            expect(button, `no action labelled "${titlePrefix}…"`).to.not.be.null;
            flushSync(() => button!.click());
        } finally {
            flushSync(() => root.unmount());
            container.remove();
        }
    }

    function skill(overrides: Partial<Skill>): Skill {
        return { name: 'query-builder', qualifiedName: 'query-builder', description: 'Build SQL', location: '/skills/query-builder/SKILL.md', ...overrides } as Skill;
    }

    it('declares the skills and slash commands single-page metadata', () => {
        const category = new PromptsAndSkillsConfigurationCategory();
        expect(category.id).to.equal(AiConfigurationCategoryId.PROMPTS_AND_SKILLS);
        expect(category.kind).to.equal('single-page');
    });

    it('indexes skills and slash commands for search, highlighting their rows', () => {
        const category = categoryWith(
            [{ name: 'refactor', qualifiedName: 'refactor', description: 'do it', location: '/s' } as unknown as Skill],
            [{ id: 'cmd', commandName: 'go', commandDescription: 'run' } as unknown as PromptFragment]
        );
        const items = category.getSearchItems();
        const byType = (typeIncludes: string) => items.filter(i => i.typeLabel.toLowerCase().includes(typeIncludes));

        expect(byType('skill')).to.have.lengthOf(1);
        expect(byType('slash')).to.have.lengthOf(1);
        expect(items.find(i => i.label === 'refactor')?.target.highlight?.rowId).to.equal('skill:refactor');
        expect(items.find(i => i.label === '/go')?.target.highlight?.rowId).to.equal('cmd:cmd');
        expect(items.every(i => i.target.categoryId === AiConfigurationCategoryId.PROMPTS_AND_SKILLS)).to.equal(true);
    });

    it('does not list skill-backed synthetic commands as slash commands', () => {
        const category = new PromptsAndSkillsConfigurationCategory();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).promptService = {
            getCommands: () => [
                { id: 'skill-command-refactor', commandName: 'refactor', isCommand: true },
                { id: 'remember', commandName: 'remember', isCommand: true }
            ] as unknown as PromptFragment[]
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).loadSlashCommands();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const commands = (category as any).slashCommands as PromptFragment[];
        expect(commands.map(command => command.id)).to.deep.equal(['remember']);
    });

    describe('Agent Plugin provenance', () => {

        const bigquery: InstalledPlugin = { pluginId: 'io.example/bq', name: 'BigQuery Data Analytics', qualifier: 'bigquery' };
        const contributed = skill({ qualifiedName: 'bigquery:query-builder', location: '/plugins/bigquery/skills/query-builder/SKILL.md' });

        it('keys and titles a skill row by its qualified name, which is what the model addresses', () => {
            const row = skillRow(categoryWithPlugins([contributed], [bigquery]), contributed);
            expect(row.id).to.equal('skill:bigquery:query-builder');
            expect(row.title).to.equal('bigquery:query-builder');
        });

        it('labels a contributed skill with the name of the plugin that supplied it', () => {
            const row = skillRow(categoryWithPlugins([contributed], [bigquery]), contributed);
            expect(row.pills).to.include('via BigQuery Data Analytics');
            // Filterable by the plugin name too, so a plugin's skills can be listed together.
            expect(row.filterText).to.contain('bigquery data analytics');
        });

        it('reveals the owning plugin when the provenance action is activated', () => {
            const revealed: string[] = [];
            const row = skillRow(categoryWithPlugins([contributed], [bigquery], revealed), contributed);
            clickRowAction(row.actions, 'Show the Agent Plugin');
            expect(revealed).to.deep.equal([bigquery.pluginId]);
        });

        it('labels nothing for a skill from a built-in root, which is the common case', () => {
            const own = skill({});
            const row = skillRow(categoryWithPlugins([own], [bigquery]), own);
            expect(row.pills?.some(pill => pill.startsWith('via '))).to.not.equal(true);
        });

        it('labels nothing rather than a bare qualifier when the qualifier belongs to no installed plugin', () => {
            const row = skillRow(categoryWithPlugins([contributed], []), contributed);
            expect(row.pills?.some(pill => pill.startsWith('via '))).to.not.equal(true);
            expect(row.title).to.equal('bigquery:query-builder');
        });

        it('labels nothing when no bridge is bound, i.e. without `@theia/ai-registry`', () => {
            const row = skillRow(categoryWithPlugins([contributed], undefined), contributed);
            expect(row.pills?.some(pill => pill.startsWith('via '))).to.not.equal(true);
        });
    });
});
