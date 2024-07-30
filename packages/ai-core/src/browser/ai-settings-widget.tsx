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

import { ContributionProvider, ILogger, nls } from '@theia/core';
import { codicon, Panel, ReactWidget } from '@theia/core/lib/browser';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { Agent, LanguageModel, LanguageModelRegistry, PromptTemplate } from '../common/';
import * as React from '@theia/core/shared/react';
import { AISettingsService } from './ai-settings-service';
import '../../src/browser/style/index.css';

@injectable()
export class AISettingsWidget extends ReactWidget {

    static readonly ID = 'ai_settings_widget';
    static readonly LABEL = nls.localizeByDefault('AI Settings');

    protected readonly settingsWidget: Panel;

    @inject(ContributionProvider) @named(Agent)
    protected readonly agents: ContributionProvider<Agent>;

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    @inject(AISettingsService)
    protected readonly aiSettingsService: AISettingsService;

    @inject(ILogger)
    protected logger: ILogger;

    protected languageModels: LanguageModel[] | undefined;

    // map from agent id to selected purpose
    protected selectedPurposes: Map<string, string> = new Map();
    // map from agent id to selected purpose and model
    protected selectedModels: Map<string, Map<string, LanguageModel>> = new Map();

    @postConstruct()
    protected init(): void {
        this.id = AISettingsWidget.ID;
        this.title.label = AISettingsWidget.LABEL;
        this.title.closable = true;
        this.addClass('theia-ai-settings-container');
        this.title.iconClass = codicon('hubot');

        this.languageModelRegistry.getLanguageModels().then(models => {
            this.languageModels = models ?? [];
            this.update();
        });

        this.update();
    }
    private onSelectedPurposesChange(agentId: string, event: React.ChangeEvent<HTMLSelectElement>): void {
        this.selectedPurposes.set(agentId, event.target.value);
        this.update();
    };

    private onSelectedModelChange(agentId: string, event: React.ChangeEvent<HTMLSelectElement>): void {
        const selectedPurpose = this.selectedPurposes.get(agentId);
        if (!selectedPurpose) {
            console.error('No purpose selected');
            return;
        }
        const selectedModel = this.languageModels?.find(model => model.id === event.target.value);
        if (!selectedModel) {
            console.error('Could not find language model with id', event.target.value);
            return;
        }
        if (this.selectedModels.get(agentId) === undefined) {
            this.selectedModels.set(agentId, new Map());
        }
        this.selectedModels.get(agentId)!.set(selectedPurpose, selectedModel);
        this.aiSettingsService.updateAgentSettings(agentId, { languageModelRequirements: [{ purpose: selectedPurpose, identifier: selectedModel.id }] });
        this.update();
    };

    protected render(): React.ReactNode {
        return (
            <div key={AISettingsWidget.ID}>
                {this.agents.getContributions().map(agent =>
                    <div key={agent.id}>
                        <h2>{agent.name}</h2>
                        <AgentTemplates agent={agent} key={agent.id} />
                        <div className='language-model-container'>
                            <label className="theia-header no-select" htmlFor={`purpose-select-${agent.id}`}>Purpose:</label>
                            <select
                                className="theia-select"
                                id={`purpose-select-${agent.id}`}
                                value={this.selectedPurposes.get(agent.id)}
                                onChange={event => this.onSelectedPurposesChange(agent.id, event)}
                            >
                                <option value=""></option>
                                {agent.languageModelRequirements.map((requirements, index) => (
                                    <option key={index} value={requirements.purpose}>{requirements.purpose}</option>
                                ))}
                            </select>
                            {agent.languageModelRequirements
                                .filter(requirements => requirements.purpose === this.selectedPurposes.get(agent.id))
                                .map((requirements, index) => <div key={index}>
                                    {requirements.identifier && <p><strong>Identifier: </strong> {requirements.identifier}</p>}
                                    {requirements.name && <p><strong>Name: </strong> {requirements.name}</p>}
                                    {requirements.vendor && <p><strong>Vendor: </strong> {requirements.vendor}</p>}
                                    {requirements.version && <p><strong>Version: </strong> {requirements.version}</p>}
                                    {requirements.family && <p><strong>Family: </strong> {requirements.family}</p>}
                                    {requirements.tokens && <p><strong>Tokens: </strong> {requirements.tokens}</p>}
                                </div>)
                            }
                            {this.selectedPurposes.get(agent.id) &&
                                <>
                                    <label className="theia-header no-select" htmlFor={`model-select-${agent.id}`}>Language Model:</label>
                                    <select
                                        className="theia-select"
                                        id={`model-select-${agent.id}`}
                                        value={this.selectedModels?.get(agent.id)?.get(this.selectedPurposes.get(agent.id)!)?.id}
                                        onChange={event => this.onSelectedModelChange(agent.id, event)}
                                    >
                                        <option value=""></option>
                                        {this.languageModels?.map((model, index) => (
                                            <option key={index} value={model.id}>{model.name ?? model.id}</option>
                                        ))}
                                    </select>
                                </>
                            }
                        </div>
                    </div>)
                }
            </div >
        );
    }
}

interface AgentProps {
    agent: Agent;
}

const AgentTemplates: React.FC<AgentProps> = ({ agent }) => <div>
    {agent.promptTemplates.map(template => <TemplateSetting agentId={agent.id} template={template} key={agent.id + '.' + template.id} />)}
</div>;

interface TemplateSettingProps {
    agentId: string;
    template: PromptTemplate;
}

const TemplateSetting: React.FC<TemplateSettingProps> = ({ agentId, template }) => <div>
    {agentId}.{template.id}
</div>;
