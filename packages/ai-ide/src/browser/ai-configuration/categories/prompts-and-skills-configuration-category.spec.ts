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
import { PromptFragment } from '@theia/ai-core/lib/common/prompt-service';
import { Skill } from '@theia/ai-core/lib/common/skill';
import { AgentPluginUiBridge, InstalledAgentPluginInfo } from '@theia/ai-core/lib/browser/agent-plugin-ui-bridge';
import { SkillRegistryUiBridge } from '@theia/ai-core/lib/browser/skill-registry-ui-bridge';
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

    /**
     * Leaves the bridge unbound when `managed` is omitted. `managed` maps a skill location to the
     * registry entry it was installed from, which is how the real bridge keys them.
     */
    function categoryWithRegistrySkills(
        skills: Skill[], managed: Record<string, string> | undefined, revealed: string[] = []
    ): PromptsAndSkillsConfigurationCategory {
        const category = categoryWith(skills, []);
        if (managed) {
            const bridge: SkillRegistryUiBridge = {
                getRegistryEntryId: forSkill => managed[forSkill.location],
                revealSkill: skillId => { revealed.push(skillId); },
                onDidChange: Event.None
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (category as any).skillRegistryUiBridge = bridge;
        }
        return category;
    }

    function skillRow(category: PromptsAndSkillsConfigurationCategory, forSkill: Skill): CollapsibleRow {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (category as any).buildSkillRow(forSkill) as CollapsibleRow;
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

        it('labels a contributed skill with the shared origin badge naming the plugin that supplied it', () => {
            const row = skillRow(categoryWithPlugins([contributed], [bigquery]), contributed);
            // The same descriptor the MCP page builds, so both pages render one badge rather than two designs.
            expect(row.origins?.map(origin => origin.label)).to.deep.equal(['via BigQuery Data Analytics']);
            // Filterable by the plugin name too, so a plugin's skills can be listed together.
            expect(row.filterText).to.contain('bigquery data analytics');
        });

        it('reveals the owning plugin when the origin badge is activated', () => {
            const revealed: string[] = [];
            const row = skillRow(categoryWithPlugins([contributed], [bigquery], revealed), contributed);
            // Activated directly: rendering the badge as a button is `AiConfigurationOriginBadge`'s
            // contract, tested where it lives; what belongs here is where this page's badge leads.
            row.origins![0].activate!();
            expect(revealed).to.deep.equal([bigquery.pluginId]);
        });

        it('keeps the provenance out of the pills, which state what the skill is rather than where it came from', () => {
            const row = skillRow(categoryWithPlugins([contributed], [bigquery]), contributed);
            expect(row.pills?.some(pill => pill.startsWith('via '))).to.not.equal(true);
        });

        it('labels nothing for a skill from a built-in root, which is the common case', () => {
            const own = skill({});
            expect(skillRow(categoryWithPlugins([own], [bigquery]), own).origins).to.equal(undefined);
        });

        it('labels nothing rather than a bare qualifier when the qualifier belongs to no installed plugin', () => {
            const row = skillRow(categoryWithPlugins([contributed], []), contributed);
            expect(row.origins).to.equal(undefined);
            expect(row.title).to.equal('bigquery:query-builder');
        });

        it('labels nothing when no bridge is bound, i.e. without `@theia/ai-registry`', () => {
            expect(skillRow(categoryWithPlugins([contributed], undefined), contributed).origins).to.equal(undefined);
        });
    });

    describe('AI registry provenance', () => {

        const installed = skill({ location: '/home/alex/.agents/skills/query-builder/SKILL.md' });
        const entryId = 'io.github.acme/query-builder';

        it('labels a registry-installed skill with the shared "From registry" badge', () => {
            const row = skillRow(categoryWithRegistrySkills([installed], { [installed.location]: entryId }), installed);
            expect(row.origins?.map(origin => origin.label)).to.deep.equal(['From registry']);
            expect(row.origins![0].tooltip).to.contain(entryId);
        });

        it('reveals the registry entry when the badge is activated', () => {
            const revealed: string[] = [];
            const row = skillRow(categoryWithRegistrySkills([installed], { [installed.location]: entryId }, revealed), installed);
            row.origins![0].activate!();
            expect(revealed).to.deep.equal([entryId]);
        });

        it('labels nothing for a skill in a directory the user controls', () => {
            const own = skill({ location: '/workspace/.agents/skills/query-builder/SKILL.md' });
            expect(skillRow(categoryWithRegistrySkills([own], { [installed.location]: entryId }), own).origins).to.equal(undefined);
        });

        it('labels nothing when no bridge is bound, i.e. without `@theia/ai-registry`', () => {
            expect(skillRow(categoryWithRegistrySkills([installed], undefined), installed).origins).to.equal(undefined);
        });

        it('credits the plugin, not the registry, for a skill a plugin contributed', () => {
            // A plugin ships its skills inside the plugin, so the two origins cannot both apply; were the
            // registry consulted anyway, a stale name collision would show a skill as coming from both.
            const bigquery: InstalledPlugin = { pluginId: 'io.example/bq', name: 'BigQuery', qualifier: 'bigquery' };
            const contributed = skill({ qualifiedName: 'bigquery:query-builder', location: '/plugins/bigquery/skills/query-builder/SKILL.md' });
            const category = categoryWithPlugins([contributed], [bigquery]);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (category as any).skillRegistryUiBridge = {
                getRegistryEntryId: () => entryId,
                revealSkill: () => { },
                onDidChange: Event.None
            } satisfies SkillRegistryUiBridge;

            expect(skillRow(category, contributed).origins?.map(origin => origin.label)).to.deep.equal(['via BigQuery']);
        });
    });
});
