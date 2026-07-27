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

import { Agent, AgentService } from '@theia/ai-core';
import { GENERIC_CAPABILITIES_SKILLS_PROMPT_ID, matchVariablesRegEx, parseCapabilitiesFromTemplate } from '@theia/ai-core/lib/common';
import { PREFERENCE_NAME_SKILL_DIRECTORIES } from '@theia/ai-core/lib/common/ai-core-preferences';
import { SkillService } from '@theia/ai-core/lib/browser/skill-service';
import { Skill } from '@theia/ai-core/lib/common/skill';
import { isCustomizedPromptFragment, PromptFragment, PromptService } from '@theia/ai-core/lib/common/prompt-service';
import { Emitter, Event, nls, URI } from '@theia/core';
import { codicon, open, OpenerService } from '@theia/core/lib/browser';
import { DisposableCollection } from '@theia/core/lib/common';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import {
    AiConfigurationCategory,
    AiConfigurationCategoryId,
    AiConfigurationCategoryOrder,
    AiConfigurationRenderContext,
    AiConfigurationSearchItem,
    AiConfigurationSearchProvider
} from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { SinglePageCategoryRenderer } from '@theia/ai-core-ui/lib/browser/ai-configuration/renderers/single-page-category-renderer';
import { AiConfigurationKindBadge, AiConfigurationSection } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-primitives';
import { AiSettingsRow } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row';
import { AiSettingsRowService } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row-service';
import { CollapsibleGroup, CollapsibleList, CollapsibleRow } from './collapsible-list';
import { AgentChips } from './agent-chips';

const SKILL_ROW_PREFIX = 'skill:';
const COMMAND_ROW_PREFIX = 'cmd:';

/**
 * The "Skills & Slash Commands" category: a `single-page` category that lists skills (file-based
 * `SKILL.md` units) and slash commands (prompt fragments with command metadata) as filterable,
 * expandable rows. A skill row opens its `SKILL.md`; a slash command row opens its template in the
 * editor. Prompt variant sets live in the agent detail, so they are not listed here.
 */
@injectable()
export class PromptsAndSkillsConfigurationCategory extends SinglePageCategoryRenderer implements AiConfigurationCategory, AiConfigurationSearchProvider {

    readonly id = AiConfigurationCategoryId.PROMPTS_AND_SKILLS;
    readonly label = nls.localize('theia/ai/ide/promptsAndSkillsConfiguration/label', 'Skills & Slash Commands');
    readonly description = nls.localize('theia/ai/ide/promptsAndSkillsConfiguration/pageSubtitle',
        'Skills the model can use and slash commands you invoke with /. Open a skill to edit its SKILL.md, or edit a slash command’s template.');
    readonly iconClass = codicon('mortar-board');
    readonly order = AiConfigurationCategoryOrder.PROMPTS_AND_SKILLS;
    readonly kind = 'single-page' as const;

    @inject(PromptService)
    protected readonly promptService: PromptService;

    @inject(AgentService)
    protected readonly agentService: AgentService;

    @inject(SkillService)
    protected readonly skillService: SkillService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(AiSettingsRowService)
    protected readonly settingsRowService: AiSettingsRowService;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    protected availableAgents: Agent[] = [];
    protected skills: Skill[] = [];
    protected slashCommands: PromptFragment[] = [];

    get renderer(): this {
        return this;
    }

    getOwnedPreferenceIds(): string[] {
        return [PREFERENCE_NAME_SKILL_DIRECTORIES];
    }

    get search(): AiConfigurationSearchProvider {
        return this;
    }

    @postConstruct()
    protected init(): void {
        this.loadAgents();
        this.loadSkills();
        this.loadSlashCommands();
        this.toDispose.pushAll([
            this.promptService.onPromptsChange(() => {
                this.loadSlashCommands();
                this.onDidChangeEmitter.fire();
            }),
            this.agentService.onDidChangeAgents(() => {
                this.loadAgents();
                this.onDidChangeEmitter.fire();
            }),
            this.skillService.onSkillsChanged(() => {
                this.loadSkills();
                this.onDidChangeEmitter.fire();
            }),
            this.settingsRowService.onPreferenceChanged(() => this.onDidChangeEmitter.fire())
        ]);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected loadAgents(): void {
        this.availableAgents = this.agentService.getAllAgents();
    }

    protected loadSkills(): void {
        this.skills = this.skillService.getSkills().sort((a, b) => a.name.localeCompare(b.name));
    }

    protected loadSlashCommands(): void {
        // Skills are surfaced as synthetic `skill-command-*` fragments; they are shown as skills, not duplicated here.
        this.slashCommands = this.promptService.getCommands()
            .filter(command => !command.id.startsWith('skill-command-'))
            .sort((a, b) => (a.commandName ?? a.id).localeCompare(b.commandName ?? b.id));
    }

    protected getAgentsForCommand(command: PromptFragment): Agent[] {
        if (!command.commandAgents || command.commandAgents.length === 0) {
            return [];
        }
        return this.availableAgents.filter(agent => command.commandAgents!.includes(agent.id));
    }

    protected renderSections(ctx: AiConfigurationRenderContext): React.ReactNode {
        const onOpenAgent = (agentId: string): void => ctx.navigate({ categoryId: AiConfigurationCategoryId.AGENTS, itemId: agentId });
        const skillAgents = this.getSkillCapableAgents();
        const groups: CollapsibleGroup[] = [
            {
                id: 'skills',
                title: nls.localizeByDefault('Skills'),
                description: nls.localize('theia/ai/ide/skillsConfiguration/skillsGroupDescription',
                    'File-based SKILL.md units the model can choose to follow, surfaced via the {{skills}} variable and the skill usage capability.'),
                rows: this.skills.map(skill => this.buildSkillRow(skill, skillAgents, onOpenAgent))
            },
            {
                id: 'slash-commands',
                title: nls.localize('theia/ai/ide/skillsConfiguration/slashCommandsSectionHeader', 'Slash Commands'),
                description: nls.localize('theia/ai/ide/skillsConfiguration/slashCommandsGroupDescription',
                    'Prompt fragments you invoke by typing /name in chat, available to one or more agents.'),
                rows: this.slashCommands.map(command => this.buildCommandRow(command, onOpenAgent))
            }
        ];
        return <>
            <AiConfigurationSection title={nls.localizeByDefault('Settings')}>
                <AiSettingsRow
                    service={this.settingsRowService}
                    preferenceId={PREFERENCE_NAME_SKILL_DIRECTORIES}
                    scope={ctx.scope}
                    control={this.settingsRowService.controlFor(PREFERENCE_NAME_SKILL_DIRECTORIES)}
                    onDidChange={ctx.update}
                />
            </AiConfigurationSection>
            <CollapsibleList
                groups={groups}
                filterPlaceholder={nls.localize('theia/ai/ide/skillsConfiguration/filterPlaceholder', 'Filter skills and slash commands by name or description')}
                emptyMessage={nls.localize('theia/ai/ide/skillsConfiguration/empty', 'No skills or slash commands are available.')}
                filterEmptyMessage={query => nls.localize('theia/ai/ide/skillsConfiguration/noMatches', 'No skills or slash commands match "{0}".', query)}
            />
        </>;
    }

    protected buildSkillRow(skill: Skill, skillAgents: Agent[], onOpenAgent: (agentId: string) => void): CollapsibleRow {
        const tools = skill.allowedTools ?? [];
        const metadata = skill.metadata ? Object.entries(skill.metadata) : [];
        const pills: string[] = [];
        if (tools.length > 0) {
            pills.push(nls.localizeByDefault('{0} tools', tools.length));
        }
        if (skillAgents.length > 0) {
            pills.push(skillAgents.length === 1 ? nls.localizeByDefault('1 agent') : nls.localizeByDefault('{0} agents', skillAgents.length));
        }
        return {
            id: SKILL_ROW_PREFIX + skill.name,
            title: skill.name,
            description: skill.description,
            pills,
            filterText: `${skill.name} ${skill.description ?? ''}`.toLocaleLowerCase(),
            headerAction: <RowActionButton
                iconClass={codicon('go-to-file')}
                label={nls.localize('theia/ai/ide/skillsConfiguration/openSkillFile', 'Open SKILL.md')}
                onActivate={() => this.openSkill(skill)}
            />,
            body: <>
                <div className='ai-variable-section'>
                    <div className='ai-variable-section-label'>{nls.localizeByDefault('Location')}</div>
                    <code className='ai-variable-id-value'>{skill.location}</code>
                </div>
                {(skill.license || skill.compatibility || metadata.length > 0) && <div className='ai-variable-section'>
                    <div className='ai-variable-section-label'>{nls.localize('theia/ai/ide/skillsConfiguration/frontmatter', 'Frontmatter')}</div>
                    {skill.license && <SkillMetaRow label={nls.localizeByDefault('License')} value={skill.license} />}
                    {skill.compatibility && <SkillMetaRow
                        label={nls.localize('theia/ai/ide/skillsConfiguration/compatibility', 'Compatibility')} value={skill.compatibility} />}
                    {metadata.map(([key, value]) => <SkillMetaRow key={key} label={key} value={value} />)}
                </div>}
                <div className='ai-variable-section'>
                    <div className='ai-variable-section-label'>{nls.localizeByDefault('Allowed tools')}</div>
                    {tools.length === 0
                        ? <div className='ai-empty-state-content'>
                            {nls.localize('theia/ai/ide/skillsConfiguration/noAllowedTools',
                                'No allowed tools declared. The skill may use any tool the agent already has.')}
                        </div>
                        : <div className='ai-configuration-chip-row'>
                            {tools.map(tool => <AiConfigurationKindBadge key={tool} label={tool} variant='outline' />)}
                        </div>}
                </div>
                <div className='ai-variable-section'>
                    <div className='ai-variable-section-label'>{nls.localize('theia/ai/ide/skillsConfiguration/usableByAgents', 'Usable by agents')}</div>
                    {skillAgents.length === 0
                        ? <div className='ai-empty-state-content'>
                            {nls.localize('theia/ai/ide/skillsConfiguration/noSkillAgents',
                                'No agent currently surfaces skills. Skills reach an agent through the {{skills}} variable or the skill usage capability.')}
                        </div>
                        : <AgentChips agents={skillAgents} onOpenAgent={onOpenAgent} />}
                </div>
            </>
        };
    }

    protected buildCommandRow(command: PromptFragment, onOpenAgent: (agentId: string) => void): CollapsibleRow {
        const commandName = command.commandName ?? command.id;
        const agents = this.getAgentsForCommand(command);
        const isGlobal = !command.commandAgents || command.commandAgents.length === 0;
        const example = `/${commandName}${command.commandArgumentHint ? ' ' + command.commandArgumentHint : ''}`;
        const pills = [isGlobal
            ? nls.localize('theia/ai/ide/skillsConfiguration/slashCommand/allAgents', 'All agents')
            : (agents.length === 1 ? nls.localizeByDefault('1 agent') : nls.localizeByDefault('{0} agents', agents.length))];
        return {
            id: COMMAND_ROW_PREFIX + command.id,
            title: '/' + commandName,
            description: command.commandDescription,
            pills,
            filterText: `${commandName} ${command.id} ${command.commandDescription ?? ''}`.toLocaleLowerCase(),
            headerAction: <RowActionButton
                iconClass={codicon('go-to-file')}
                label={nls.localizeByDefault('Open')}
                onActivate={() => this.editCommand(command)}
            />,
            body: <>
                <div className='ai-variable-id-row'>
                    <span className='ai-variable-id-label'>{nls.localizeByDefault('Command')}</span>
                    <code className='ai-variable-id-value'>{example}</code>
                </div>
                <div className='ai-variable-section'>
                    <div className='ai-variable-section-label'>{nls.localize('theia/ai/ide/skillsConfiguration/slashCommand/availableForAgents', 'Available for agents')}</div>
                    {isGlobal
                        ? <div className='ai-empty-state-content'>{nls.localize('theia/ai/ide/skillsConfiguration/slashCommand/allAgents', 'All agents')}</div>
                        : <AgentChips agents={agents} onOpenAgent={onOpenAgent} />}
                </div>
            </>
        };
    }

    /** Opens the slash command's backing template: its customization if one exists, otherwise the built-in. */
    protected editCommand(command: PromptFragment): void {
        const fragment = this.promptService.getRawPromptFragment(command.id);
        if (fragment && isCustomizedPromptFragment(fragment)) {
            this.promptService.editCustomization(fragment.id, fragment.customizationId);
        } else {
            this.promptService.editBuiltInCustomization(command.id);
        }
    }

    /**
     * Agents that surface skills, i.e. whose effective system prompt references the `{{skills}}`
     * variable or the skills capability (following `{{prompt:...}}` references). Skills are the same
     * for every agent, so this list is not skill-specific.
     */
    protected getSkillCapableAgents(): Agent[] {
        return this.availableAgents.filter(agent => agent.prompts.some(prompt => {
            const effectiveId = this.promptService.getEffectiveVariantId(prompt.id) ?? prompt.id;
            return this.templateSurfacesSkills(effectiveId, new Set<string>());
        }));
    }

    protected templateSurfacesSkills(fragmentId: string, visited: Set<string>): boolean {
        if (visited.has(fragmentId)) {
            return false;
        }
        visited.add(fragmentId);
        const template = this.promptService.getRawPromptFragment(fragmentId)?.template;
        if (!template) {
            return false;
        }
        const variableTokens = matchVariablesRegEx(template).map(match => match[1].trim());
        if (variableTokens.some(token => {
            const base = token.split(':')[0].trim();
            return base === 'skills' || base === 'skill';
        })) {
            return true;
        }
        if (parseCapabilitiesFromTemplate(template).some(capability => capability.fragmentId === GENERIC_CAPABILITIES_SKILLS_PROMPT_ID)) {
            return true;
        }
        return variableTokens.some(token => token.startsWith('prompt:')
            && this.templateSurfacesSkills(token.slice('prompt:'.length).trim().split('|')[0].trim(), visited));
    }

    protected openSkill(skill: Skill): void {
        open(this.openerService, URI.fromFilePath(skill.location));
    }

    getSearchItems(): AiConfigurationSearchItem[] {
        const items: AiConfigurationSearchItem[] = [];
        const skillLabel = nls.localizeByDefault('Skill');
        const slashCommandLabel = nls.localize('theia/ai/ide/skillsConfiguration/slashCommandsSectionHeader', 'Slash Commands');
        for (const skill of this.skills) {
            items.push({
                label: skill.name,
                typeLabel: skillLabel,
                categoryId: this.id,
                target: { categoryId: this.id, highlight: { rowId: SKILL_ROW_PREFIX + skill.name } },
                keywords: skill.description ?? ''
            });
        }
        for (const command of this.slashCommands) {
            items.push({
                label: '/' + (command.commandName ?? command.id),
                typeLabel: slashCommandLabel,
                categoryId: this.id,
                target: { categoryId: this.id, highlight: { rowId: COMMAND_ROW_PREFIX + command.id } },
                keywords: `${command.id} ${command.commandDescription ?? ''}`
            });
        }
        return items;
    }
}

/** A compact header action (open / edit) matching the placement of the variables' copy button. */
const RowActionButton: React.FC<{ iconClass: string; label: string; onActivate: () => void }> = ({ iconClass, label, onActivate }) => (
    <button
        type='button'
        className='ai-variable-copy-button'
        aria-label={label}
        title={label}
        onClick={event => {
            event.stopPropagation();
            onActivate();
        }}
    >
        <span aria-hidden='true' className={iconClass}></span>
    </button>
);

const SkillMetaRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className='ai-variable-id-row'>
        <span className='ai-variable-id-label'>{label}</span>
        <code className='ai-variable-id-value'>{value}</code>
    </div>
);
