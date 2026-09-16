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
import { AgentPluginUiBridge, InstalledAgentPluginInfo } from '@theia/ai-core/lib/browser/agent-plugin-ui-bridge';
import { SkillRegistryUiBridge } from '@theia/ai-core/lib/browser/skill-registry-ui-bridge';
import { Skill } from '@theia/ai-core/lib/common/skill';
import { isCustomizedPromptFragment, PromptFragment, PromptService } from '@theia/ai-core/lib/common/prompt-service';
import { Emitter, Event, ILogger, nls, URI } from '@theia/core';
import { codicon, open, OpenerService } from '@theia/core/lib/browser';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { DisposableCollection } from '@theia/core/lib/common';
import { inject, injectable, named, optional, postConstruct } from '@theia/core/shared/inversify';
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
import {
    AiConfigurationKindBadge,
    AiConfigurationSection,
    AiConfigurationValueRow
} from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-primitives';
import { AiSettingsRow } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row';
import { AiSettingsRowService } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row-service';
import {
    CollapsibleGroup,
    CollapsibleList,
    CollapsibleRow,
    CollapsibleRowAction
} from '@theia/ai-core-ui/lib/browser/ai-configuration/components/collapsible-list';
import { AiConfigurationOrigin } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-origin-badge';
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

    @inject(ClipboardService)
    protected readonly clipboardService: ClipboardService;

    @inject(ILogger) @named('ai-ide:PromptsAndSkillsConfigurationCategory')
    protected readonly logger: ILogger;

    @inject(AgentPluginUiBridge) @optional()
    protected readonly agentPluginUiBridge?: AgentPluginUiBridge;

    @inject(SkillRegistryUiBridge) @optional()
    protected readonly skillRegistryUiBridge?: SkillRegistryUiBridge;

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
        if (this.agentPluginUiBridge) {
            // The plugin names come from the bridge, so installing one changes this page even when the skills do not.
            this.toDispose.push(this.agentPluginUiBridge.onDidChange(() => this.onDidChangeEmitter.fire()));
        }
        if (this.skillRegistryUiBridge) {
            // Likewise: linking or unlinking a skill folder changes its provenance, not the skill itself.
            this.toDispose.push(this.skillRegistryUiBridge.onDidChange(() => this.onDidChangeEmitter.fire()));
        }
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected loadAgents(): void {
        this.availableAgents = this.agentService.getAllAgents();
    }

    protected loadSkills(): void {
        // Sorted and keyed by the qualified name: it is what the model addresses and the only name unique across roots.
        this.skills = this.skillService.getSkills().sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName));
    }

    protected loadSlashCommands(): void {
        // Skills are surfaced as synthetic `skill-command-*` fragments; they are shown as skills, not duplicated here.
        this.slashCommands = this.promptService.getCommands()
            .filter(command => !command.id.startsWith('skill-command-'))
            .sort((a, b) => (a.commandName ?? a.id).localeCompare(b.commandName ?? b.id));
    }

    /** Stable identity so the value rows do not re-render on every page update. */
    protected copyValue = (value: string): void => {
        // `writeText` may be async depending on the platform; nothing here depends on its completion.
        Promise.resolve(this.clipboardService.writeText(value)).catch(
            error => this.logger.error(`Failed to copy "${value}" to the clipboard`, error));
    };

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
                description: skillAgents.length === 0
                    ? nls.localize('theia/ai/ide/skillsConfiguration/noSkillAgents',
                        'No agent currently surfaces skills, so none of these are reached: a skill needs the {{skills}} variable '
                        + 'or the skill usage capability in an agent\'s prompt.')
                    : nls.localize('theia/ai/ide/skillsConfiguration/skillsGroupDescription',
                        'File-based SKILL.md units the model can choose to follow, surfaced via the {{skills}} variable and the skill usage capability.'),
                rows: this.skills.map(skill => this.buildSkillRow(skill))
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

    protected buildSkillRow(skill: Skill): CollapsibleRow {
        const tools = skill.allowedTools ?? [];
        const metadata = skill.metadata ? Object.entries(skill.metadata) : [];
        const plugin = this.getOwningPlugin(skill);
        const origins = this.getSkillOrigins(skill);
        const pills: string[] = [];
        if (tools.length > 0) {
            pills.push(nls.localizeByDefault('{0} tools', tools.length));
        }
        return {
            id: SKILL_ROW_PREFIX + skill.qualifiedName,
            title: skill.qualifiedName,
            description: skill.description,
            pills,
            origins,
            filterText: `${skill.qualifiedName} ${skill.description ?? ''} ${plugin?.name ?? ''}`.toLocaleLowerCase(),
            actions: <CollapsibleRowAction
                iconClass={codicon('edit')}
                label={nls.localize('theia/ai/ide/skillsConfiguration/openSkillFile', 'Open SKILL.md')}
                onActivate={() => this.openSkill(skill)}
            />,
            body: <>
                <AiConfigurationValueRow label={nls.localizeByDefault('Location')} value={skill.location} onCopy={this.copyValue} />
                {(skill.license || skill.compatibility || metadata.length > 0) && <div className='ai-variable-section'>
                    <div className='ai-variable-section-label'>{nls.localize('theia/ai/ide/skillsConfiguration/frontmatter', 'Frontmatter')}</div>
                    {skill.license && <AiConfigurationValueRow
                        label={nls.localizeByDefault('License')} value={skill.license} onCopy={this.copyValue} />}
                    {skill.compatibility && <AiConfigurationValueRow
                        label={nls.localize('theia/ai/ide/skillsConfiguration/compatibility', 'Compatibility')}
                        value={skill.compatibility} onCopy={this.copyValue} />}
                    {metadata.map(([key, value]) => <AiConfigurationValueRow key={key} label={key} value={value} onCopy={this.copyValue} />)}
                </div>}
                <div className='ai-variable-section'>
                    <div className='ai-variable-section-label'>{nls.localizeByDefault('Allowed tools')}</div>
                    {tools.length === 0
                        ? <div className='ai-variable-section-note'>
                            {nls.localize('theia/ai/ide/skillsConfiguration/noAllowedTools',
                                'No allowed tools declared. The skill may use any tool the agent already has.')}
                        </div>
                        : <div className='ai-configuration-chip-row'>
                            {tools.map(tool => <AiConfigurationKindBadge key={tool} label={tool} variant='outline' />)}
                        </div>}
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
            actions: <CollapsibleRowAction
                iconClass={codicon('edit')}
                label={nls.localize('theia/ai/ide/skillsConfiguration/editCommandTemplate', 'Edit prompt template')}
                onActivate={() => this.editCommand(command)}
            />,
            body: <>
                <AiConfigurationValueRow label={nls.localizeByDefault('Command')} value={example} onCopy={this.copyValue} />
                <div className='ai-variable-section'>
                    <div className='ai-variable-section-label'>{nls.localize('theia/ai/ide/skillsConfiguration/slashCommand/availableForAgents', 'Available for agents')}</div>
                    {/* "All agents" is a value, not an empty state: render it as a chip so it lines up with the
                        per-agent chips of a scoped command instead of being centered like a placeholder. */}
                    {isGlobal
                        ? <div className='ai-configuration-chip-row'>
                            <AiConfigurationKindBadge
                                label={nls.localize('theia/ai/ide/skillsConfiguration/slashCommand/allAgents', 'All agents')}
                                variant='outline'
                                title={nls.localize('theia/ai/ide/skillsConfiguration/slashCommand/allAgentsTooltip',
                                    'This command declares no agents, so it is available to every agent.')}
                            />
                        </div>
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

    /**
     * The registry entry a skill was installed from, or the Agent Plugin that contributed it - never
     * both: the registry installs a skill into a root of its own, a plugin ships it inside the plugin.
     * Empty for a workspace or configured skill, which is the common case, and always empty without
     * `@theia/ai-registry`, which binds both bridges.
     */
    protected getSkillOrigins(skill: Skill): AiConfigurationOrigin[] | undefined {
        const plugin = this.getOwningPlugin(skill);
        if (plugin) {
            return [AiConfigurationOrigin.agentPlugin(plugin, () => this.agentPluginUiBridge?.revealPlugin(plugin.pluginId))];
        }
        const entryId = this.skillRegistryUiBridge?.getRegistryEntryId(skill);
        if (entryId) {
            return [AiConfigurationOrigin.registry(entryId, () => this.skillRegistryUiBridge?.revealSkill(entryId))];
        }
        return undefined;
    }

    /**
     * The Agent Plugin a skill was contributed by, or `undefined` for a skill from a built-in root - the
     * common case - and for a qualifier belonging to no installed plugin: a bare qualifier is worth neither
     * a label nor a reveal action. Always `undefined` without `@theia/ai-registry`, which binds the bridge.
     */
    protected getOwningPlugin(skill: Skill): InstalledAgentPluginInfo | undefined {
        const qualifier = Skill.qualifierOf(skill);
        return qualifier ? this.agentPluginUiBridge?.getPluginByQualifier(qualifier) : undefined;
    }

    getSearchItems(): AiConfigurationSearchItem[] {
        const items: AiConfigurationSearchItem[] = [];
        const skillLabel = nls.localizeByDefault('Skill');
        const slashCommandLabel = nls.localize('theia/ai/ide/skillsConfiguration/slashCommandsSectionHeader', 'Slash Commands');
        for (const skill of this.skills) {
            items.push({
                label: skill.qualifiedName,
                typeLabel: skillLabel,
                categoryId: this.id,
                target: { categoryId: this.id, highlight: { rowId: SKILL_ROW_PREFIX + skill.qualifiedName } },
                // The unqualified name too: a skill contributed by a plugin is still looked up by the name in its SKILL.md.
                keywords: `${skill.name} ${skill.description ?? ''}`
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

