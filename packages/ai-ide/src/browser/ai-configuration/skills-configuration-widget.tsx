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

import { Disposable, nls, URI } from '@theia/core';
import { codicon, OpenerService, open, ReactWidget } from '@theia/core/lib/browser';
import { inject, injectable, optional, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { Skill } from '@theia/ai-core/lib/common/skill';
import { SkillService } from '@theia/ai-core/lib/browser/skill-service';
import { AgentPluginUiBridge } from '@theia/ai-core/lib/browser/agent-plugin-ui-bridge';
import { PromptFragment, PromptService } from '@theia/ai-core/lib/common/prompt-service';
import { Agent, AgentService } from '@theia/ai-core';
import { isChatAgent } from '@theia/ai-chat';

/** A component rather than an inline handler, so the reveal closes over the id without reallocating. */
export class SkillPluginOrigin extends React.Component<SkillPluginOrigin.Props> {

    override render(): React.ReactNode {
        const { pluginName } = this.props;
        return (
            <button
                className="ai-skill-plugin-origin"
                onClick={this.reveal}
                title={nls.localize('theia/ai/ide/skillsConfiguration/skill/revealPlugin', 'Show the plugin \'{0}\'', pluginName)}
            >
                {nls.localize('theia/ai/ide/skillsConfiguration/skill/viaPlugin', 'via {0}', pluginName)}
            </button>
        );
    }

    protected reveal = () => {
        this.props.revealPlugin(this.props.pluginId);
    };
}
export namespace SkillPluginOrigin {
    export interface Props {
        pluginId: string;
        pluginName: string;
        revealPlugin: (pluginId: string) => void;
    }
}

@injectable()
export class AISkillsConfigurationWidget extends ReactWidget {
    static readonly ID = 'ai-skills-configuration-widget';
    static readonly LABEL = nls.localizeByDefault('Skills');

    @inject(SkillService)
    protected readonly skillService: SkillService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(PromptService)
    protected readonly promptService: PromptService;

    @inject(AgentService)
    protected readonly agentService: AgentService;

    @inject(AgentPluginUiBridge) @optional()
    protected readonly agentPluginUiBridge?: AgentPluginUiBridge;

    protected skills: Skill[] = [];
    protected slashCommands: PromptFragment[] = [];
    protected agents: Agent[] = [];

    @postConstruct()
    protected init(): void {
        this.id = AISkillsConfigurationWidget.ID;
        this.title.label = AISkillsConfigurationWidget.LABEL;
        this.title.closable = false;
        this.addClass('ai-configuration-widget');

        this.loadSkills();
        this.loadSlashCommands();
        this.loadAgents();
        this.update();
        this.toDispose.pushAll([
            this.skillService.onSkillsChanged(() => {
                this.loadSkills();
                this.update();
            }),
            this.promptService.onPromptsChange(() => {
                this.loadSlashCommands();
                this.update();
            }),
            this.agentService.onDidChangeAgents(() => {
                this.loadAgents();
                this.update();
            }),
            // Names come from the bridge, so an install changes this even when the skills do not.
            this.agentPluginUiBridge?.onDidChange(() => this.update()) ?? Disposable.NULL
        ]);
    }

    protected loadSkills(): void {
        this.skills = this.skillService.getSkills().sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName));
    }

    protected loadSlashCommands(): void {
        this.slashCommands = this.promptService.getCommands().sort((a, b) => {
            const nameA = a.commandName ?? a.id;
            const nameB = b.commandName ?? b.id;
            return nameA.localeCompare(nameB);
        });
    }

    protected loadAgents(): void {
        this.agents = this.agentService.getAllAgents();
    }

    protected getAgentsForCommand(command: PromptFragment): Agent[] {
        if (!command.commandAgents || command.commandAgents.length === 0) {
            return [];
        }
        return this.agents.filter(agent => command.commandAgents!.includes(agent.id));
    }

    protected openSkill = (skill: Skill): void => {
        open(this.openerService, URI.fromFilePath(skill.location));
    };

    protected render(): React.ReactNode {
        return (
            <div className="ai-skills-configuration-container">
                {this.renderSkillsSection()}
                {this.renderSlashCommandsSection()}
            </div>
        );
    }

    protected renderSkillsSection(): React.ReactNode {
        return (
            <div className="ai-skills-section">
                <h3 className="section-header">
                    {nls.localizeByDefault('Skills')}
                </h3>
                {this.skills.length === 0 ? (
                    <div className="ai-empty-state-content">
                        {nls.localize('theia/ai/ide/skillsConfiguration/noSkills', 'No skills available')}
                    </div>
                ) : (
                    <div className="ai-configuration-table-container">
                        <table className="ai-configuration-table">
                            <thead>
                                <tr>
                                    <th className="skill-name-column">{nls.localizeByDefault('Name')}</th>
                                    <th className="skill-description-column">{nls.localizeByDefault('Description')}</th>
                                    <th className="skill-location-column">
                                        {nls.localizeByDefault('Location')}
                                    </th>
                                    <th className="skill-open-column"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {this.skills.map(skill => this.renderSkillRow(skill))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    }

    protected renderSkillRow(skill: Skill): React.ReactNode {
        return (
            <tr key={skill.qualifiedName}>
                <td className="skill-name-column">
                    <span>{skill.qualifiedName}</span>
                    {this.renderSkillPluginOrigin(skill)}
                </td>
                <td className="skill-description-column"><span>{skill.description}</span></td>
                <td className="skill-location-column"><span>{skill.location}</span></td>
                <td className="skill-open-column">
                    <button
                        className="theia-button secondary"
                        onClick={() => this.openSkill(skill)}
                        title={nls.localizeByDefault('Open')}
                    >
                        {nls.localizeByDefault('Open')}
                    </button>
                </td>
            </tr>
        );
    }

    /**
     * Nothing for a skill from a built-in root, which is the common case, and nothing when the
     * qualifier belongs to no installed plugin - a bare qualifier is not worth a link.
     */
    protected renderSkillPluginOrigin(skill: Skill): React.ReactNode {
        const qualifier = Skill.qualifierOf(skill);
        if (!qualifier) {
            return undefined;
        }
        const plugin = this.agentPluginUiBridge?.getPluginByQualifier(qualifier);
        if (!plugin) {
            return undefined;
        }
        return <SkillPluginOrigin pluginId={plugin.pluginId} pluginName={plugin.name} revealPlugin={this.revealPlugin} />;
    }

    protected revealPlugin = (pluginId: string): void => {
        this.agentPluginUiBridge?.revealPlugin(pluginId);
    };

    protected renderSlashCommandsSection(): React.ReactNode {
        return (
            <div className="ai-slash-commands-section">
                <h3 className="section-header">
                    {nls.localize('theia/ai/ide/skillsConfiguration/slashCommandsSectionHeader', 'Slash Commands')}
                </h3>
                {this.slashCommands.length === 0 ? (
                    <div className="ai-empty-state-content">
                        {nls.localize('theia/ai/ide/skillsConfiguration/noSlashCommands', 'No slash commands available')}
                    </div>
                ) : (
                    <div className="ai-configuration-table-container">
                        <table className="ai-configuration-table">
                            <thead>
                                <tr>
                                    <th className="slash-command-name-column">
                                        {nls.localizeByDefault('Command')}
                                    </th>
                                    <th className="slash-command-description-column">{nls.localizeByDefault('Description')}</th>
                                    <th className="slash-command-agents-column">
                                        {nls.localizeByDefault('Agents')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {this.slashCommands.map(command => this.renderSlashCommandRow(command))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    }

    protected renderSlashCommandRow(command: PromptFragment): React.ReactNode {
        const agents = this.getAgentsForCommand(command);
        const isGlobalCommand = !command.commandAgents || command.commandAgents.length === 0;

        return (
            <tr key={command.id}>
                <td className="slash-command-name-column">
                    <span className="slash-command-prefix">/</span>
                    <span>{command.commandName ?? command.id}</span>
                </td>
                <td className="slash-command-description-column">
                    <span>{command.commandDescription ?? ''}</span>
                </td>
                <td className="slash-command-agents-column">
                    {isGlobalCommand ? (
                        <span className="slash-command-all-agents">
                            {nls.localize('theia/ai/ide/skillsConfiguration/slashCommand/allAgents', 'All agents')}
                        </span>
                    ) : (
                        <div className="slash-command-agent-chips">
                            {agents.map(agent => (
                                <span key={agent.id} className="agent-chip" title={agent.description}>
                                    <span className={(isChatAgent(agent) && agent.iconClass) ? agent.iconClass : codicon('copilot')}></span>
                                    {agent.name}
                                </span>
                            ))}
                        </div>
                    )}
                </td>
            </tr>
        );
    }
}
