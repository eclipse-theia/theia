// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { codicon, ReactWidget } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { Agent, LanguageModel, LanguageModelRegistry, PromptCustomizationService } from '../../common';
import { AISettingsService } from '../ai-settings-service';
import { LanguageModelRenderer } from './language-model-renderer';
import { TemplateRenderer } from './template-settings-renderer';
import { AIConfigurationSelectionService } from './ai-configuration-service';
import { AIVariableConfigurationWidget } from './variable-configuration-widget';
import { AgentService } from '../../common/agent-service';

@injectable()
export class AIAgentConfigurationWidget extends ReactWidget {

    static readonly ID = 'ai-agent-configuration-container-widget';
    static readonly LABEL = 'Agents';

    @inject(AgentService)
    protected readonly agentService: AgentService;

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    @inject(PromptCustomizationService)
    protected readonly promptCustomizationService: PromptCustomizationService;

    @inject(AISettingsService)
    protected readonly aiSettingsService: AISettingsService;

    @inject(AIConfigurationSelectionService)
    protected readonly aiConfigurationSelectionService: AIConfigurationSelectionService;

    protected languageModels: LanguageModel[] | undefined;

    @postConstruct()
    protected init(): void {
        this.id = AIAgentConfigurationWidget.ID;
        this.title.label = AIAgentConfigurationWidget.LABEL;
        this.title.closable = false;

        this.languageModelRegistry.getLanguageModels().then(models => {
            this.languageModels = models ?? [];
            this.update();
        });
        this.toDispose.push(this.languageModelRegistry.onChange(({ models }) => {
            this.languageModels = models;
            this.update();
        }));

        this.aiSettingsService.onDidChange(() => this.update());
        this.aiConfigurationSelectionService.onDidAgentChange(() => this.update());
        this.update();
    }

    protected render(): React.ReactNode {
        return <div className='ai-agent-configuration-main'>
            <div className='configuration-agents-list preferences-tree-widget theia-TreeContainer' style={{ width: '25%' }}>
                <ul>
                    {this.agentService.getAgents(true).map(agent =>
                        <li key={agent.id} className='theia-TreeNode theia-CompositeTreeNode theia-ExpandableTreeNode' onClick={() => this.setActiveAgent(agent)}>{agent.name}</li>
                    )}
                </ul>
            </div>
            <div className='configuration-agent-panel preferences-editor-widget'>
                {this.renderAgentDetails()}
            </div>
        </div>;
    }

    private renderAgentDetails(): React.ReactNode {
        const agent = this.aiConfigurationSelectionService.getActiveAgent();
        if (!agent) {
            return <div>Please select an Agent first!</div>;
        }

        const enabled = this.agentService.isEnabled(agent.id);

        return <div key={agent.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div className='settings-section-title settings-section-category-title' style={{ paddingLeft: 0, paddingBottom: 10 }}>{agent.name}</div>
            <div style={{ paddingBottom: 10 }}>{agent.description}</div>
            <div style={{ paddingBottom: 10 }}>
                <label>
                    <input type="checkbox" checked={enabled} onChange={this.toggleAgentEnabled} />
                    Enable Agent
                </label>
            </div>
            <div style={{ paddingBottom: 10 }}>
                <span style={{ marginRight: '0.5rem' }}>Variables:</span>
                <ul className='variable-references'>
                    {agent.variables.map(variableId => <li className='theia-TreeNode theia-CompositeTreeNode theia-ExpandableTreeNode theia-mod-selected'>
                        <div key={variableId} onClick={() => { this.showVariableConfigurationTab(); }} className='variable-reference'>
                            <span>{variableId}</span>
                            <i className={codicon('chevron-right')}></i>
                        </div></li>)}
                </ul>
            </div>
            <div className='ai-templates'>
                {agent.promptTemplates?.map(template =>
                    <TemplateRenderer
                        key={agent?.id + '.' + template.id}
                        agentId={agent.id}
                        template={template}
                        promptCustomizationService={this.promptCustomizationService} />)}
            </div>
            <div className='ai-lm-requirements'>
                <LanguageModelRenderer
                    agent={agent}
                    languageModels={this.languageModels}
                    aiSettingsService={this.aiSettingsService}
                    languageModelRegistry={this.languageModelRegistry} />
            </div>
        </div>;
    }

    protected showVariableConfigurationTab(): void {
        this.aiConfigurationSelectionService.selectConfigurationTab(AIVariableConfigurationWidget.ID);
    }

    protected setActiveAgent(agent: Agent): void {
        this.aiConfigurationSelectionService.setActiveAgent(agent);
        this.update();
    }

    private toggleAgentEnabled = () => {
        const agent = this.aiConfigurationSelectionService.getActiveAgent();
        if (!agent) {
            return false;
        }
        const enabled = this.agentService.isEnabled(agent.id);
        if (enabled) {
            this.agentService.disableAgent(agent.id);
        } else {
            this.agentService.enableAgent(agent.id);
        }
        this.update();
    };

}
