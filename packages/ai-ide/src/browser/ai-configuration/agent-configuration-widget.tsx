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

import {
    Agent,
    AgentService,
    AISettingsService,
    AIVariableService,
    LanguageModel,
    LanguageModelRegistry,
    matchVariablesRegEx,
    PROMPT_FUNCTION_REGEX,
    PromptFragmentCustomizationService,
    PromptService,
} from '@theia/ai-core/lib/common';
import { codicon, QuickInputService, ReactWidget } from '@theia/core/lib/browser';
import { URI } from '@theia/core/lib/common';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { AIConfigurationSelectionService } from './ai-configuration-service';
import { LanguageModelRenderer } from './language-model-renderer';
import { AIVariableConfigurationWidget } from './variable-configuration-widget';
import { nls } from '@theia/core';
import { PromptVariantRenderer } from './template-settings-renderer';

interface ParsedPrompt {
    functions: string[];
    globalVariables: string[];
    agentSpecificVariables: string[];
};

@injectable()
export class AIAgentConfigurationWidget extends ReactWidget {

    static readonly ID = 'ai-agent-configuration-container-widget';
    static readonly LABEL = nls.localize('theia/ai/core/agentConfiguration/label', 'Agents');

    @inject(AgentService)
    protected readonly agentService: AgentService;

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    @inject(PromptFragmentCustomizationService)
    protected readonly promptFragmentCustomizationService: PromptFragmentCustomizationService;

    @inject(AISettingsService)
    protected readonly aiSettingsService: AISettingsService;

    @inject(AIConfigurationSelectionService)
    protected readonly aiConfigurationSelectionService: AIConfigurationSelectionService;

    @inject(AIVariableService)
    protected readonly variableService: AIVariableService;

    @inject(PromptService)
    protected promptService: PromptService;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    protected languageModels: LanguageModel[] | undefined;
    protected parsedPromptParts: ParsedPrompt | undefined;
    protected isLoadingDetails = false;

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
        this.toDispose.push(this.promptService.onPromptsChange(() => this.updateParsedPromptParts()));

        // Only call updateParsedPromptParts() as it already calls this.update() internally
        this.toDispose.push(this.promptFragmentCustomizationService.onDidChangePromptFragmentCustomization(() => {
            this.updateParsedPromptParts();
        }));

        // Only call updateParsedPromptParts() as it already calls this.update() internally
        this.toDispose.push(this.aiSettingsService.onDidChange(() => {
            this.updateParsedPromptParts();
        }));

        // Only call updateParsedPromptParts() as it already calls this.update() internally
        this.toDispose.push(this.aiConfigurationSelectionService.onDidAgentChange(() => {
            this.updateParsedPromptParts();
        }));

        this.agentService.onDidChangeAgents(() => this.update());
        this.updateParsedPromptParts();
    }

    protected async updateParsedPromptParts(): Promise<void> {
        this.isLoadingDetails = true;
        const agent = this.aiConfigurationSelectionService.getActiveAgent();
        if (agent) {
            this.parsedPromptParts = await this.parsePromptFragmentsForVariableAndFunction(agent);
        } else {
            this.parsedPromptParts = undefined;
        }
        this.isLoadingDetails = false;
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
                    <button
                        style={{ marginLeft: 0 }}
                        className='theia-button main'
                        onClick={() => this.addCustomAgent()}>
                        {nls.localize('theia/ai/core/agentConfiguration/addCustomAgent', 'Add Custom Agent')}
                    </button>
                </div>
            </div>
            <div className='configuration-agent-panel preferences-editor-widget'>
                {this.renderAgentDetails()}
            </div>
        </div>;
    }

    protected renderAgentName(agent: Agent): React.ReactNode {
        const tagsSuffix = agent.tags?.length ? <span>{agent.tags.map(tag => <span key={tag} className='agent-tag'>{tag}</span>)}</span> : '';
        return <span>{agent.name} {tagsSuffix}</span>;
    }

    protected renderAgentDetails(): React.ReactNode {
        if (this.isLoadingDetails) {
            return <div>{nls.localize('theia/ai/core/agentConfiguration/loading', 'Loading...')}</div>;
        }

        const agent = this.aiConfigurationSelectionService.getActiveAgent();
        if (!agent) {
            return <div>{nls.localize('theia/ai/core/agentConfiguration/selectAgentMessage', 'Please select an Agent first!')}</div>;
        }

        const enabled = this.agentService.isEnabled(agent.id);

        if (!this.parsedPromptParts) {
            this.updateParsedPromptParts();
            return <div>{nls.localize('theia/ai/core/agentConfiguration/loading', 'Loading...')}</div>;
        }

        const globalVariables = Array.from(new Set([...this.parsedPromptParts.globalVariables, ...agent.variables]));
        const functions = Array.from(new Set([...this.parsedPromptParts.functions, ...agent.functions]));

        return <div key={agent.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div className='settings-section-title settings-section-category-title' style={{ paddingLeft: 0, paddingBottom: 10 }}>
                {this.renderAgentName(agent)}
                <pre style={{ fontSize: 'small', margin: 0 }}>
                    Id: {agent.id}
                </pre>
            </div>
            <div style={{ paddingBottom: 10 }}>{agent.description}</div>
            <div style={{ paddingBottom: 10 }}>
                <label>
                    <input type="checkbox" checked={enabled} onChange={this.toggleAgentEnabled} />
                    {nls.localize('theia/ai/core/agentConfiguration/enableAgent', 'Enable Agent')}
                </label>
            </div>
            <div className="settings-section-subcategory-title ai-settings-section-subcategory-title">
                {nls.localize('theia/ai/core/agentConfiguration/promptTemplates', 'Prompt Templates')}
            </div>
            <div className="ai-templates">
                {(() => {
                    const prompts = agent.prompts;
                    return prompts.length > 0 ? (
                        prompts.map(prompt => (
                            <div key={agent.id + '.' + prompt.id}>
                                <PromptVariantRenderer
                                    key={agent.id + '.' + prompt.id}
                                    agentId={agent.id}
                                    promptVariantSet={prompt}
                                    promptService={this.promptService}
                                    aiSettingsService={this.aiSettingsService}
                                />
                            </div>
                        ))
                    ) : (
                        <div>{nls.localize('theia/ai/core/agentConfiguration/noDefaultTemplate', 'No default template available')}</div>
                    );
                })()}
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
                        promptVariables={this.parsedPromptParts.agentSpecificVariables}
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

    protected async parsePromptFragmentsForVariableAndFunction(agent: Agent): Promise<ParsedPrompt> {
        const result: ParsedPrompt = { functions: [], globalVariables: [], agentSpecificVariables: [] };
        const agentSettings = await this.aiSettingsService.getAgentSettings(agent.id);
        const selectedVariants = agentSettings?.selectedVariants || {};

        const mainTemplates = agent.prompts.filter(template => template.variants !== undefined);

        for (const mainTemplate of mainTemplates) {
            const promptId = selectedVariants[mainTemplate.id] ?? mainTemplate.id;
            const promptToAnalyze: string | undefined = this.promptService.getRawPromptFragment(promptId)?.template;

            if (!promptToAnalyze) {
                continue;
            }

            this.extractVariablesAndFunctions(promptToAnalyze, result, agent);
        }

        return result;
    }

    protected extractVariablesAndFunctions(promptContent: string, result: ParsedPrompt, agent: Agent): void {
        const variableMatches = matchVariablesRegEx(promptContent);
        variableMatches.forEach(match => {
            const variableId = match[2];
            // skip comments
            if (variableId.startsWith('!--')) {
                return;
            }
            if (this.variableService.hasVariable(variableId) &&
                agent.agentSpecificVariables.find(v => v.name === variableId) === undefined) {
                result.globalVariables.push(variableId);
            } else {
                result.agentSpecificVariables.push(variableId);
            }
        });

        const functionMatches = [...promptContent.matchAll(PROMPT_FUNCTION_REGEX)];
        functionMatches.forEach(match => {
            const functionId = match[1];
            result.functions.push(functionId);
        });
    }

    protected showVariableConfigurationTab(): void {
        this.aiConfigurationSelectionService.selectConfigurationTab(AIVariableConfigurationWidget.ID);
    }

    protected async addCustomAgent(): Promise<void> {
        const locations = await this.promptFragmentCustomizationService.getCustomAgentsLocations();

        // If only one location is available, use the direct approach
        if (locations.length === 1) {
            this.promptFragmentCustomizationService.openCustomAgentYaml(locations[0].uri);
            return;
        }

        // Multiple locations - show quick picker
        const quickPick = this.quickInputService.createQuickPick();
        quickPick.title = 'Select Location for Custom Agents File';
        quickPick.placeholder = 'Choose where to create or open a custom agents file';

        quickPick.items = locations.map(location => ({
            label: location.uri.path.toString(),
            description: location.exists ? 'Open existing file' : 'Create new file',
            location
        }));

        quickPick.onDidAccept(async () => {
            const selectedItem = quickPick.selectedItems[0] as unknown as { location: { uri: URI, exists: boolean } };
            if (selectedItem && selectedItem.location) {
                quickPick.dispose();
                this.promptFragmentCustomizationService.openCustomAgentYaml(selectedItem.location.uri);
            }
        });

        quickPick.show();
    }

    protected setActiveAgent(agent: Agent): void {
        this.aiConfigurationSelectionService.setActiveAgent(agent);
        this.updateParsedPromptParts();
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
        return <>{nls.localizeByDefault('None')}</>;
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
        return <>{nls.localizeByDefault('None')}</>;
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
        return <>{nls.localizeByDefault('None')}</>;
    }
    return <>
        {variables.map(variableId =>
            <AgentSpecificVariable
                key={variableId}
                variableId={variableId}
                agent={agent}
                promptVariables={promptVariables} />
        )}
    </>;
};
interface AgentSpecificVariableProps {
    variableId: string;
    agent: Agent;
    promptVariables: string[];
}
const AgentSpecificVariable = ({ variableId, agent, promptVariables }: AgentSpecificVariableProps) => {
    const agentDefinedVariable = agent.agentSpecificVariables.find(v => v.name === variableId);
    const undeclared = agentDefinedVariable === undefined;
    const notUsed = !promptVariables.includes(variableId) && agentDefinedVariable?.usedInPrompt === true;
    return <li key={variableId}>
        <div><span>{nls.localize('theia/ai/core/agentConfiguration/name', 'Name:')}</span> <span>{variableId}</span></div>
        {undeclared ? <div><span>{nls.localize('theia/ai/core/agentConfiguration/undeclared', 'Undeclared')}</span></div> :
            (<>
                <div><span>{nls.localize('theia/ai/core/agentConfiguration/description', 'Description:')}</span> <span>{agentDefinedVariable.description}</span></div>
                {notUsed && <div>{nls.localize('theia/ai/core/agentConfiguration/notUsedInPrompt', 'Not used in prompt')}</div>}
            </>)}
        <hr />
    </li>;
};
