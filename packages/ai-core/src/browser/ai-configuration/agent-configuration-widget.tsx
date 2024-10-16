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
import {
    Agent,
    AISettingsService,
    AIVariableService,
    LanguageModel,
    LanguageModelRegistry,
    PROMPT_FUNCTION_REGEX,
    PROMPT_VARIABLE_REGEX,
    PromptCustomizationService,
    PromptService,
} from '../../common';
import { LanguageModelRenderer } from './language-model-renderer';
import { TemplateRenderer } from './template-settings-renderer';
import { AIConfigurationSelectionService } from './ai-configuration-service';
import { AIVariableConfigurationWidget } from './variable-configuration-widget';
import { AgentService } from '../../common/agent-service';

interface ParsedPrompt {
    functions: string[];
    globalVariables: string[];
    agentSpecificVariables: string[];
};

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

    @inject(AIVariableService)
    protected readonly variableService: AIVariableService;

    @inject(PromptService)
    protected promptService: PromptService;

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
        this.toDispose.push(this.promptCustomizationService.onDidChangePrompt(() => this.update()));

        this.aiSettingsService.onDidChange(() => this.update());
        this.aiConfigurationSelectionService.onDidAgentChange(() => this.update());
        this.agentService.onDidChangeAgents(() => this.update());
        this.update();
    }

    protected render(): React.ReactNode {
        return <div className='ai-agent-configuration-main'>
            <div className='configuration-agents-list preferences-tree-widget theia-TreeContainer' style={{ width: '25%' }}>
                <ul>
                    {this.agentService.getAllAgents().map(agent =>
                        <li key={agent.id} className='theia-TreeNode theia-CompositeTreeNode theia-ExpandableTreeNode' onClick={() => this.setActiveAgent(agent)}>
                            {this.renderAgentName(agent)}
                        </li>
                    )}
                </ul>
                <div className='configuration-agents-add'>
                    <button style={{ marginLeft: 0 }} className='theia-button main' onClick={() => this.addCustomAgent()}>Add Custom Agent</button>
                </div>
            </div>
            <div className='configuration-agent-panel preferences-editor-widget'>
                {this.renderAgentDetails()}
            </div>
        </div>;
    }

    private renderAgentName(agent: Agent): React.ReactNode {
        const tagsSuffix = agent.tags?.length ? <span>{agent.tags.map(tag => <span className='agent-tag'>{tag}</span>)}</span> : '';
        return <span>{agent.name} {tagsSuffix}</span>;
    }

    private renderAgentDetails(): React.ReactNode {
        const agent = this.aiConfigurationSelectionService.getActiveAgent();
        if (!agent) {
            return <div>Please select an Agent first!</div>;
        }

        const enabled = this.agentService.isEnabled(agent.id);

        const parsedPromptParts = this.parsePromptTemplatesForVariableAndFunction(agent);
        const globalVariables = Array.from(new Set([...parsedPromptParts.globalVariables, ...agent.variables]));
        const functions = Array.from(new Set([...parsedPromptParts.functions, ...agent.functions]));

        return <div key={agent.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div className='settings-section-title settings-section-category-title' style={{ paddingLeft: 0, paddingBottom: 10 }}>{this.renderAgentName(agent)}</div>
            <div style={{ paddingBottom: 10 }}>{agent.description}</div>
            <div style={{ paddingBottom: 10 }}>
                <label>
                    <input type="checkbox" checked={enabled} onChange={this.toggleAgentEnabled} />
                    Enable Agent
                </label>
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
            <div>
                <span>Used Global Variables:</span>
                <ul className='variable-references'>
                    <AgentGlobalVariables variables={globalVariables} showVariableConfigurationTab={this.showVariableConfigurationTab.bind(this)} />
                </ul>
            </div>
            <div>
                <span>Used agent-specific Variables:</span>
                <ul className='variable-references'>
                    <AgentSpecificVariables
                        promptVariables={parsedPromptParts.agentSpecificVariables}
                        agent={agent}
                    />
                </ul>
            </div>
            <div>
                <span>Used Functions:</span>
                <ul className='function-references'>
                    <AgentFunctions functions={functions} />
                </ul>
            </div>
        </div>;
    }

    private parsePromptTemplatesForVariableAndFunction(agent: Agent): ParsedPrompt {
        const promptTemplates = agent.promptTemplates;
        const result: ParsedPrompt = { functions: [], globalVariables: [], agentSpecificVariables: [] };
        promptTemplates.forEach(template => {
            const storedPrompt = this.promptService.getRawPrompt(template.id);
            const prompt = storedPrompt?.template ?? template.template;
            const variableMatches = [...prompt.matchAll(PROMPT_VARIABLE_REGEX)];

            variableMatches.forEach(match => {
                const variableId = match[1];
                // if the variable is part of the variable service and not part of the agent specific variables then it is a global variable
                if (this.variableService.hasVariable(variableId) &&
                    agent.agentSpecificVariables.find(v => v.name === variableId) === undefined) {
                    result.globalVariables.push(variableId);
                } else {
                    result.agentSpecificVariables.push(variableId);
                }
            });

            const functionMatches = [...prompt.matchAll(PROMPT_FUNCTION_REGEX)];
            functionMatches.forEach(match => {
                const functionId = match[1];
                result.functions.push(functionId);
            });

        });
        return result;
    }

    protected showVariableConfigurationTab(): void {
        this.aiConfigurationSelectionService.selectConfigurationTab(AIVariableConfigurationWidget.ID);
    }

    protected addCustomAgent(): void {
        this.promptCustomizationService.openCustomAgentYaml();
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
interface AgentGlobalVariablesProps {
    variables: string[];
    showVariableConfigurationTab: () => void;
}
const AgentGlobalVariables = ({ variables: globalVariables, showVariableConfigurationTab }: AgentGlobalVariablesProps) => {
    if (globalVariables.length === 0) {
        return <>None</>;
    }
    return <>
        {globalVariables.map(variableId => <li key={variableId} className='theia-TreeNode theia-CompositeTreeNode theia-ExpandableTreeNode theia-mod-selected'>
            <div key={variableId} onClick={() => { showVariableConfigurationTab(); }} className='variable-reference'>
                <span>{variableId}</span>
                <i className={codicon('chevron-right')}></i>
            </div></li>)}

    </>;
};

interface AgentFunctionsProps {
    functions: string[];
}
const AgentFunctions = ({ functions }: AgentFunctionsProps) => {
    if (functions.length === 0) {
        return <>None</>;
    }
    return <>
        {functions.map(functionId => <li key={functionId} className='variable-reference'>
            <span>{functionId}</span>
        </li>)}
    </>;
};

interface AgentSpecificVariablesProps {
    promptVariables: string[];
    agent: Agent;
}
const AgentSpecificVariables = ({ promptVariables, agent }: AgentSpecificVariablesProps) => {
    const agentDefinedVariablesName = agent.agentSpecificVariables.map(v => v.name);
    const variables = Array.from(new Set([...promptVariables, ...agentDefinedVariablesName]));
    if (variables.length === 0) {
        return <>None</>;
    }
    return <>
        {variables.map(variableId =>
            <AgentSpecifcVariable
                key={variableId}
                variableId={variableId}
                agent={agent}
                promptVariables={promptVariables} />

        )}
    </>;
};
interface AgentSpecifcVariableProps {
    variableId: string;
    agent: Agent;
    promptVariables: string[];
}
const AgentSpecifcVariable = ({ variableId, agent, promptVariables }: AgentSpecifcVariableProps) => {
    const agentDefinedVariable = agent.agentSpecificVariables.find(v => v.name === variableId);
    const undeclared = agentDefinedVariable === undefined;
    const notUsed = !promptVariables.includes(variableId) && agentDefinedVariable?.usedInPrompt === true;
    return <li key={variableId}>
        <div><span>Name:</span> <span>{variableId}</span></div>
        {undeclared ? <div><span>Undeclared</span></div> :
            (<>
                <div><span>Description:</span> <span>{agentDefinedVariable.description}</span></div>
                {notUsed && <div>Not used in prompt</div>}
            </>)}
        <hr />
    </li>;
};
