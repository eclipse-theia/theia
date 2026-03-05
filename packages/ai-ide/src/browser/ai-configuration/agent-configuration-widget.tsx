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
    FrontendLanguageModelRegistry,
    LanguageModel,
    LanguageModelRegistry,
    matchVariablesRegEx,
    PROMPT_FUNCTION_REGEX,
    ParsedCapability,
    parseCapabilitiesFromTemplate,
    PromptFragmentCustomizationService,
    PromptService,
    NotificationType,
    PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE,
} from '@theia/ai-core/lib/common';
import { isChatAgent } from '@theia/ai-chat/lib/common';
import { codicon, CommonCommands, QuickInputService } from '@theia/core/lib/browser';
import { CommandService } from '@theia/core/lib/common/command';
import { URI } from '@theia/core/lib/common';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { AIConfigurationSelectionService } from './ai-configuration-service';
import { LanguageModelRenderer } from './language-model-renderer';
import { LanguageModelAliasRegistry, LanguageModelAlias } from '@theia/ai-core/lib/common/language-model-alias';
import { AIVariableConfigurationWidget } from './variable-configuration-widget';
import { nls } from '@theia/core';
import { PromptVariantRenderer } from './template-settings-renderer';
import { AIListDetailConfigurationWidget } from './base/ai-list-detail-configuration-widget';
import { AgentNotificationSettings } from './components/agent-notification-settings';

interface ParsedPrompt {
    functions: string[];
    globalVariables: string[];
    agentSpecificVariables: string[];
    capabilities: ParsedCapability[];
};

@injectable()
export class AIAgentConfigurationWidget extends AIListDetailConfigurationWidget<Agent> {

    static readonly ID = 'ai-agent-configuration-container-widget';
    static readonly LABEL = nls.localizeByDefault('Agents');

    @inject(AgentService)
    protected readonly agentService: AgentService;

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: FrontendLanguageModelRegistry;

    @inject(PromptFragmentCustomizationService)
    protected readonly promptFragmentCustomizationService: PromptFragmentCustomizationService;

    @inject(LanguageModelAliasRegistry)
    protected readonly languageModelAliasRegistry: LanguageModelAliasRegistry;

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

    @inject(CommandService)
    protected readonly commandService: CommandService;

    protected languageModels: LanguageModel[] | undefined;
    protected languageModelAliases: LanguageModelAlias[] = [];
    protected parsedPromptParts: ParsedPrompt | undefined;
    protected isLoadingDetails = false;
    protected agentCompletionNotificationType?: NotificationType;

    @postConstruct()
    protected init(): void {
        this.id = AIAgentConfigurationWidget.ID;
        this.title.label = AIAgentConfigurationWidget.LABEL;
        this.title.closable = false;

        Promise.all([
            this.loadItems(),
            this.languageModelRegistry.getLanguageModels().then(models => {
                this.languageModels = models ?? [];
            })
        ]).then(() => this.update());

        this.languageModelAliasRegistry.ready.then(() => {
            this.languageModelAliases = this.languageModelAliasRegistry.getAliases();
            this.toDispose.push(this.languageModelAliasRegistry.onDidChange(() => {
                this.languageModelAliases = this.languageModelAliasRegistry.getAliases();
                this.update();
            }));
        });

        this.toDispose.pushAll([
            this.languageModelRegistry.onChange(({ models }) => {
                this.languageModelAliases = this.languageModelAliasRegistry.getAliases();
                this.languageModels = models;
                this.update();
            }),
            this.promptService.onPromptsChange(() => this.updateParsedPromptParts()),
            this.promptFragmentCustomizationService.onDidChangePromptFragmentCustomization(() => {
                this.updateParsedPromptParts();
            }),
            this.aiSettingsService.onDidChange(() => {
                this.updateParsedPromptParts();
            }),
            this.aiConfigurationSelectionService.onDidAgentChange(() => {
                this.selectedItem = this.aiConfigurationSelectionService.getActiveAgent();
                this.updateParsedPromptParts();
            }),
            this.agentService.onDidChangeAgents(async () => {
                await this.loadItems();
                this.update();
            })
        ]);

        this.updateParsedPromptParts();
    }

    protected async loadItems(): Promise<void> {
        this.items = this.agentService.getAllAgents();
        const activeAgent = this.aiConfigurationSelectionService.getActiveAgent();
        if (activeAgent) {
            this.selectedItem = activeAgent;
        } else if (this.items.length > 0 && !this.selectedItem) {
            this.selectedItem = this.items[0];
            this.aiConfigurationSelectionService.setActiveAgent(this.items[0]);
        }
    }

    protected getItemId(agent: Agent): string {
        return agent.id;
    }

    protected getItemLabel(agent: Agent): string {
        return agent.name;
    }

    protected override getEmptySelectionMessage(): string {
        return nls.localize('theia/ai/core/agentConfiguration/selectAgentMessage', 'Please select an Agent first!');
    }

    protected override handleItemSelect = (agent: Agent): void => {
        this.selectedItem = agent;
        this.aiConfigurationSelectionService.setActiveAgent(agent);
        this.updateParsedPromptParts();
    };

    protected override renderItemPrefix(agent: Agent): React.ReactNode {
        const enabled = this.agentService.isEnabled(agent.id);
        return (
            <span
                className={
                    `agent-status-indicator ${enabled ? `agent-enabled ${codicon('circle-filled')}` : `agent-disabled ${codicon('circle')}`}`
                }
                title={enabled ? nls.localizeByDefault('Enabled') : nls.localizeByDefault('Disabled')}
            >
            </span>
        );
    }

    protected override renderItemSuffix(agent: Agent): React.ReactNode {
        if (!agent.tags?.length) {
            return undefined;
        }
        return <span>{agent.tags.map(tag => <span key={tag} className='agent-tag'>{tag}</span>)}</span>;
    }

    protected override renderList(): React.ReactNode {
        return (
            <div className="ai-configuration-list preferences-tree-widget theia-TreeContainer">
                <ul>
                    {this.items.map(agent => {
                        const agentId = this.getItemId(agent);
                        const isSelected = this.selectedItem && this.getItemId(this.selectedItem) === agentId;
                        return (
                            <li
                                key={agentId}
                                className={`theia-TreeNode theia-CompositeTreeNode${isSelected ? ' theia-mod-selected' : ''} ${this.getItemClassName(agent)}`}
                                onClick={() => this.handleItemSelect(agent)}
                            >
                                {this.renderItemPrefix(agent)}
                                <span className="ai-configuration-list-item-label">{this.getItemLabel(agent)}</span>
                                {this.renderItemSuffix(agent)}
                            </li>
                        );
                    })}
                </ul>
                <div className='configuration-agents-add'>
                    <button
                        className='theia-button main'
                        onClick={() => this.addCustomAgent()}>
                        {nls.localize('theia/ai/core/agentConfiguration/addCustomAgent', 'Add Custom Agent')}
                    </button>
                </div>
            </div>
        );
    }

    protected async updateParsedPromptParts(): Promise<void> {
        this.isLoadingDetails = true;
        const agent = this.aiConfigurationSelectionService.getActiveAgent();
        if (agent) {
            this.parsedPromptParts = await this.parsePromptFragmentsForVariableAndFunction(agent);
            const agentSettings = await this.aiSettingsService.getAgentSettings(agent.id);
            this.showInChatState = agentSettings?.showInChat ?? true;
            this.agentCompletionNotificationType = agentSettings?.completionNotification;
        } else {
            this.parsedPromptParts = undefined;
            this.agentCompletionNotificationType = undefined;
        }
        this.isLoadingDetails = false;
        this.update();
    }

    protected showInChatState: boolean = true;

    protected renderItemDetail(agent: Agent): React.ReactNode {
        if (this.isLoadingDetails) {
            return <div>{nls.localizeByDefault('Loading...')}</div>;
        }

        const enabled = this.agentService.isEnabled(agent.id);

        if (!this.parsedPromptParts) {
            this.updateParsedPromptParts();
            return <div>{nls.localizeByDefault('Loading...')}</div>;
        }

        const globalVariables = Array.from(new Set([...this.parsedPromptParts.globalVariables, ...agent.variables]));
        const functions = Array.from(new Set([...this.parsedPromptParts.functions, ...agent.functions]));

        const agentNameWithTags = <>
            {agent.name}
            {agent.tags && agent.tags.length > 0 && <span>{agent.tags.map(tag => <span key={tag} className='agent-tag'>{tag}</span>)}</span>}
        </>;

        return <div key={agent.id}>
            <div className='settings-section-title settings-section-category-title agent-title-with-toggle'>
                <div className='agent-title-content'>
                    <div>
                        {agentNameWithTags}
                        <pre className='ai-id-label'>Id: {agent.id}</pre>
                    </div>
                    <div className='agent-toggles'>
                        <label className='agent-enable-toggle' title={nls.localize('theia/ai/core/agentConfiguration/enableAgent', 'Enable Agent')}>
                            <span className='toggle-label'>{nls.localize('theia/ai/core/agentConfiguration/enableAgent', 'Enable Agent')}</span>
                            <div className='toggle-switch' onClick={this.toggleAgentEnabled}>
                                <input type="checkbox" checked={enabled} onChange={this.toggleAgentEnabled} />
                                <span className='toggle-slider'></span>
                            </div>
                        </label>
                        {isChatAgent(agent) && (
                            <label className={`agent-enable-toggle${enabled ? '' : ' disabled'}`}
                                title={nls.localize('theia/ai/core/agentConfiguration/showInChat', 'Show in Chat')}>
                                <span className='toggle-label'>{nls.localize('theia/ai/core/agentConfiguration/showInChat', 'Show in Chat')}</span>
                                <div className='toggle-switch' onClick={enabled ? this.toggleShowInChat : undefined}>
                                    <input type="checkbox" checked={this.showInChatState} disabled={!enabled} onChange={this.toggleShowInChat} />
                                    <span className='toggle-slider'></span>
                                </div>
                            </label>
                        )}
                    </div>
                </div>
            </div>

            {agent.description && (
                <div className="ai-agent-description">
                    {agent.description}
                </div>
            )}
            {agent.prompts.length > 0 && (
                <>
                    <div className="settings-section-subcategory-title ai-settings-section-subcategory-title">
                        {nls.localize('theia/ai/core/agentConfiguration/promptTemplates', 'Prompt Templates')}
                    </div>
                    <table className="ai-templates-table">
                        <thead>
                            <tr>
                                <th>{nls.localize('theia/ai/core/agentConfiguration/templateName', 'Template')}</th>
                                <th>{nls.localize('theia/ai/core/agentConfiguration/variant', 'Variant')}</th>
                                <th className="template-actions-header">{nls.localizeByDefault('Actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {agent.prompts.map(prompt => (
                                <PromptVariantRenderer
                                    key={agent.id + '.' + prompt.id}
                                    agentId={agent.id}
                                    promptVariantSet={prompt}
                                    promptService={this.promptService}
                                />
                            ))}
                        </tbody>
                    </table>
                </>
            )}

            <div className='ai-lm-requirements'>
                <LanguageModelRenderer
                    agent={agent}
                    languageModels={this.languageModels}
                    aiSettingsService={this.aiSettingsService}
                    languageModelRegistry={this.languageModelRegistry}
                    languageModelAliases={this.languageModelAliases}
                />
            </div>

            {globalVariables.length > 0 && (
                <>
                    <div className="settings-section-subcategory-title ai-settings-section-subcategory-title">
                        {nls.localize('theia/ai/core/agentConfiguration/usedGlobalVariables', 'Used Global Variables')}
                    </div>
                    <AgentGlobalVariables
                        variables={globalVariables}
                        variableService={this.variableService}
                    />
                </>
            )}

            {this.parsedPromptParts.agentSpecificVariables.length > 0 && (
                <>
                    <div className="settings-section-subcategory-title ai-settings-section-subcategory-title">
                        {nls.localize('theia/ai/core/agentConfiguration/usedAgentSpecificVariables', 'Used Agent-Specific Variables')}
                    </div>
                    <ul className='variable-references'>
                        <AgentSpecificVariables
                            promptVariables={this.parsedPromptParts.agentSpecificVariables}
                            agent={agent}
                        />
                    </ul>
                </>
            )}

            {functions.length > 0 && (
                <>
                    <div className="settings-section-subcategory-title ai-settings-section-subcategory-title">
                        {nls.localize('theia/ai/core/agentConfiguration/usedFunctions', 'Used Functions')}
                    </div>
                    <ul className='function-references'>
                        <AgentFunctions functions={functions} />
                    </ul>
                </>
            )}

            {this.parsedPromptParts.capabilities.length > 0 && (
                <>
                    <div className="settings-section-subcategory-title">
                        {nls.localize('theia/ai/core/agentConfiguration/availableCapabilities', 'Available Capabilities')}
                    </div>
                    <AgentCapabilities capabilities={this.parsedPromptParts.capabilities} />
                </>
            )}

            {isChatAgent(agent) && (
                <>
                    <div className="settings-section-subcategory-title ai-settings-section-subcategory-title">
                        {nls.localize('theia/ai/core/agentConfiguration/notificationSettings', 'Notification Settings')}
                    </div>
                    <AgentNotificationSettings
                        agentId={agent.id}
                        currentNotificationType={this.agentCompletionNotificationType}
                        onNotificationTypeChange={this.handleNotificationTypeChange}
                        onOpenNotificationSettings={this.openNotificationSettings}
                    />
                </>
            )}
        </div>;
    }

    protected async parsePromptFragmentsForVariableAndFunction(agent: Agent): Promise<ParsedPrompt> {
        const result: ParsedPrompt = { functions: [], globalVariables: [], agentSpecificVariables: [], capabilities: [] };
        const agentSettings = await this.aiSettingsService.getAgentSettings(agent.id);
        const selectedVariants = agentSettings?.selectedVariants ?? {};

        for (const mainTemplate of agent.prompts) {
            const promptId = selectedVariants[mainTemplate.id] ?? mainTemplate.defaultVariant.id ?? mainTemplate.id;
            const promptToAnalyze: string | undefined = this.promptService.getRawPromptFragment(promptId)?.template;

            if (!promptToAnalyze) {
                continue;
            }

            this.extractVariablesAndFunctions(promptToAnalyze, result, agent);
            this.extractCapabilities(promptToAnalyze, result);
        }

        return result;
    }

    protected extractCapabilities(promptContent: string, result: ParsedPrompt): void {
        const capabilities = parseCapabilitiesFromTemplate(promptContent);
        const existingIds = new Set(result.capabilities.map(c => c.fragmentId));
        for (const capability of capabilities) {
            if (!existingIds.has(capability.fragmentId)) {
                const fragment = this.promptService.getRawPromptFragment(capability.fragmentId);
                result.capabilities.push({
                    ...capability,
                    name: fragment?.name,
                    description: fragment?.description,
                });
                existingIds.add(capability.fragmentId);
            }
        }
    }

    protected extractVariablesAndFunctions(promptContent: string, result: ParsedPrompt, agent: Agent): void {
        const variableMatches = matchVariablesRegEx(promptContent);
        variableMatches.forEach(match => {
            const variableId = match[1];
            if (variableId.startsWith('!--') || variableId.startsWith('capability:')) {
                return;
            }

            const baseVariableId = variableId.split(':')[0];

            if (this.variableService.hasVariable(baseVariableId) &&
                agent.agentSpecificVariables.find(v => v.name === baseVariableId) === undefined) {
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
        quickPick.title = nls.localize('theia/ai/ide/agentConfiguration/customAgentLocationQuickPick/title', 'Select Location for Custom Agents File');
        quickPick.placeholder = nls.localize('theia/ai/ide/agentConfiguration/customAgentLocationQuickPick/placeholder', 'Choose where to create or open a custom agents file');

        quickPick.items = locations.map(location => ({
            label: location.uri.path.toString(),
            description: location.exists
                ? nls.localize('theia/ai/ide/agentConfiguration/customAgentLocationQuickPick/openExistingFile', 'Open existing file')
                : nls.localize('theia/ai/ide/agentConfiguration/customAgentLocationQuickPick/createNewFile', 'Create new file'),
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

    private toggleAgentEnabled = async () => {
        const agent = this.aiConfigurationSelectionService.getActiveAgent();
        if (!agent) {
            return false;
        }
        const enabled = this.agentService.isEnabled(agent.id);
        if (enabled) {
            await this.agentService.disableAgent(agent.id);
        } else {
            await this.agentService.enableAgent(agent.id);
        }
        this.update();
    };

    private toggleShowInChat = async () => {
        const agent = this.aiConfigurationSelectionService.getActiveAgent();
        if (!agent) {
            return;
        }
        if (!this.agentService.isEnabled(agent.id)) {
            return;
        }
        const newValue = !this.showInChatState;
        await this.aiSettingsService.updateAgentSettings(agent.id, { showInChat: newValue });
        this.showInChatState = newValue;
        this.update();
    };

    private handleNotificationTypeChange = async (agentId: string, notificationType: NotificationType | undefined): Promise<void> => {
        await this.aiSettingsService.updateAgentSettings(agentId, {
            completionNotification: notificationType
        });
        this.agentCompletionNotificationType = notificationType;
        this.update();
    };

    private openNotificationSettings = (): void => {
        this.commandService.executeCommand(CommonCommands.OPEN_PREFERENCES.id, PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE);
    };
}

interface AgentGlobalVariablesProps {
    variables: string[];
    variableService: AIVariableService;
}
const AgentGlobalVariables = ({ variables: globalVariables, variableService }: AgentGlobalVariablesProps) => {
    if (globalVariables.length === 0) {
        return <div className="ai-empty-state-content">
            {nls.localizeByDefault('None')}
        </div>;
    }

    const allVariables = variableService.getVariables();
    const variableData = globalVariables.map(varId => {
        const variable = allVariables.find(v => v.id === varId);
        return {
            id: varId,
            name: variable?.name || varId,
            description: variable?.description || ''
        };
    });

    return (
        <table className="ai-templates-table">
            <thead>
                <tr>
                    <th>{nls.localizeByDefault('Variable')}</th>
                    <th>{nls.localizeByDefault('Description')}</th>
                </tr>
            </thead>
            <tbody>
                {variableData.map(variable => (
                    <tr key={variable.id}>
                        <td className="ai-variable-name-cell">{variable.name}</td>
                        <td className="ai-variable-description-cell">
                            {variable.description || nls.localize('theia/ai/ide/agentConfiguration/noDescription', 'No description available')}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
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

interface AgentCapabilitiesProps {
    capabilities: ParsedCapability[];
}
const AgentCapabilities = ({ capabilities }: AgentCapabilitiesProps) => (
    <table className="ai-templates-table">
        <thead>
            <tr>
                <th>{nls.localizeByDefault('ID')}</th>
                <th>{nls.localizeByDefault('Name')}</th>
                <th title={nls.localize('theia/ai/ide/agentConfiguration/enabledByDefault', 'Indicates if the feature is enabled by default')}>
                    {nls.localizeByDefault('Default')}
                </th>
                <th>{nls.localizeByDefault('Description')}</th>
            </tr>
        </thead>
        <tbody>
            {capabilities.map(capability => (
                <tr key={capability.fragmentId}>
                    <td className="ai-variable-name-cell">{capability.fragmentId}</td>
                    <td className="ai-variable-name-cell">{capability.name ?? capability.fragmentId}</td>
                    <td className="ai-variable-name-cell">
                        {capability.defaultEnabled
                            ? nls.localize('theia/ai/ide/agentConfiguration/capabilityOn', 'On')
                            : nls.localizeByDefault('Off')}
                    </td>
                    <td className="ai-variable-description-cell">
                        {capability.description ?? nls.localize('theia/ai/ide/agentConfiguration/noDescription', 'No description available')}
                    </td>
                </tr>
            ))}
        </tbody>
    </table>
);

interface AgentSpecificVariablesProps {
    promptVariables: string[];
    agent: Agent;
}
const AgentSpecificVariables = ({ promptVariables, agent }: AgentSpecificVariablesProps) => {
    const agentDefinedVariablesName = agent.agentSpecificVariables.map(v => v.name);
    const variables = Array.from(new Set([...promptVariables, ...agentDefinedVariablesName]));
    if (variables.length === 0) {
        return <div className="ai-empty-state-content">
            {nls.localizeByDefault('None')}
        </div>;
    }
    return <div>
        {variables.map(variableId =>
            <AgentSpecificVariable
                key={variableId}
                variableId={variableId}
                agent={agent}
                promptVariables={promptVariables} />
        )}
    </div>;
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
    return <div key={variableId} className="ai-agent-specific-variable-item">
        <div className="ai-configuration-value-row">
            <span className="ai-configuration-value-row-label">{nls.localizeByDefault('Name')}:</span>
            <span className="ai-configuration-value-row-value">{variableId}</span>
        </div>
        {undeclared ? (
            <div className="ai-configuration-value-row"
                title={nls.localize('theia/ai/core/agentConfiguration/undeclaredTooltip',
                    'This variable is used in the prompt but has no description declared by the agent.')}>
                <span className="ai-configuration-value-row-label">{nls.localizeByDefault('Status')}:</span>
                <span className="ai-configuration-value-row-value ai-configuration-warning-text">
                    {nls.localize('theia/ai/core/agentConfiguration/undeclared', 'Undeclared')}
                </span>
            </div>
        ) : (
            <>
                <div className="ai-configuration-value-row">
                    <span className="ai-configuration-value-row-label">{nls.localizeByDefault('Description')}:</span>
                    <span className="ai-configuration-value-row-value">{agentDefinedVariable.description}</span>
                </div>
                {notUsed && (
                    <div className="ai-configuration-value-row"
                        title={nls.localize('theia/ai/core/agentConfiguration/notUsedInPromptTooltip',
                            'This variable is declared by the agent but not referenced in the current prompt template.')}>
                        <span className="ai-configuration-value-row-label">{nls.localizeByDefault('Status')}:</span>
                        <span className="ai-configuration-value-row-value ai-configuration-warning-text">
                            {nls.localize('theia/ai/core/agentConfiguration/notUsedInPrompt', 'Not used in prompt')}
                        </span>
                    </div>
                )}
            </>
        )}
    </div>;
};
