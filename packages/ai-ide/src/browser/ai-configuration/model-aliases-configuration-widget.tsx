// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { LanguageModelAliasRegistry, LanguageModelAlias } from '@theia/ai-core/lib/common/language-model-alias';
import { FrontendLanguageModelRegistry, LanguageModel, LanguageModelRegistry, LanguageModelRequirement } from '@theia/ai-core/lib/common/language-model';
import { nls } from '@theia/core/lib/common/nls';
import { AIConfigurationSelectionService } from './ai-configuration-service';
import { AgentService, AISettingsService } from '@theia/ai-core';

export interface ModelAliasesConfigurationProps {
    languageModelAliasRegistry: LanguageModelAliasRegistry;
    languageModelRegistry: LanguageModelRegistry;
}

@injectable()
export class ModelAliasesConfigurationWidget extends ReactWidget {
    static readonly ID = 'ai-model-aliases-configuration-widget';
    static readonly LABEL = nls.localize('theia/ai/core/modelAliasesConfiguration/label', 'Model Aliases');

    @inject(LanguageModelAliasRegistry)
    protected readonly languageModelAliasRegistry: LanguageModelAliasRegistry;
    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: FrontendLanguageModelRegistry;
    @inject(AIConfigurationSelectionService)
    protected readonly aiConfigurationSelectionService: AIConfigurationSelectionService;
    @inject(AISettingsService)
    protected readonly aiSettingsService: AISettingsService;
    @inject(AgentService)
    protected readonly agentService: AgentService;

    protected aliases: LanguageModelAlias[] = [];
    protected languageModels: LanguageModel[] = [];
    /**
     * Map from alias ID to a list of agent IDs that have a language model requirement for that alias.
     */
    protected matchingAgentIdsForAliasMap: Map<string, string[]> = new Map();
    /**
     * Map from alias ID to the resolved LanguageModel (what the alias currently evaluates to).
     */
    protected resolvedModelForAlias: Map<string, LanguageModel | undefined> = new Map();

    @postConstruct()
    protected init(): void {
        this.id = ModelAliasesConfigurationWidget.ID;
        this.title.label = ModelAliasesConfigurationWidget.LABEL;
        this.title.closable = false;

        const aliasesPromise = this.loadAliases();
        const languageModelsPromise = this.loadLanguageModels();
        const matchingAgentsPromise = this.loadMatchingAgentIdsForAllAliases();
        Promise.all([aliasesPromise, languageModelsPromise, matchingAgentsPromise]).then(() => this.update());

        this.languageModelAliasRegistry.ready.then(() =>
            this.toDispose.push(this.languageModelAliasRegistry.onDidChange(async () => {
                await this.loadAliases();
                this.update();
            }))
        );

        this.toDispose.pushAll([
            this.languageModelRegistry.onChange(async () => {
                await this.loadAliases();
                await this.loadLanguageModels();
                this.update();
            }),
            this.aiSettingsService.onDidChange(async () => {
                await this.loadMatchingAgentIdsForAllAliases();
                this.update();
            }),
            this.aiConfigurationSelectionService.onDidAliasChange(() => this.update())
        ]);
    }

    protected async loadAliases(): Promise<void> {
        await this.languageModelAliasRegistry.ready;
        this.aliases = this.languageModelAliasRegistry.getAliases();
        // Set the initial selection if not set
        if (this.aliases.length > 0 && !this.aiConfigurationSelectionService.getSelectedAliasId()) {
            this.aiConfigurationSelectionService.setSelectedAliasId(this.aliases[0].id);
        }
        await this.loadMatchingAgentIdsForAllAliases();
        // Resolve evaluated models for each alias
        this.resolvedModelForAlias = new Map();
        for (const alias of this.aliases) {
            const model = await this.languageModelRegistry.getReadyLanguageModel(alias.id);
            this.resolvedModelForAlias.set(alias.id, model);
        }
    }

    protected async loadLanguageModels(): Promise<void> {
        this.languageModels = await this.languageModelRegistry.getLanguageModels();
    }

    /**
     * Loads a map from alias ID to a list of agent IDs that have a language model requirement for that alias.
     */
    protected async loadMatchingAgentIdsForAllAliases(): Promise<void> {
        const agents = this.agentService.getAllAgents();
        const aliasMap: Map<string, string[]> = new Map();
        for (const alias of this.aliases) {
            const matchingAgentIds: string[] = [];
            for (const agent of agents) {
                const requirementSetting = await this.aiSettingsService.getAgentSettings(agent.id);
                if (requirementSetting?.languageModelRequirements) {
                    // requirement is set via settings, check if it is this alias
                    if (requirementSetting?.languageModelRequirements?.find(e => e.identifier === alias.id)) {
                        matchingAgentIds.push(agent.id);
                    }
                } else {
                    // requirement is NOT set via settings, check if this alias is the default for this agent
                    if (agent.languageModelRequirements.some((req: LanguageModelRequirement) => req.identifier === alias.id)) {
                        matchingAgentIds.push(agent.id);
                    }
                }
            }
            aliasMap.set(alias.id, matchingAgentIds);
        }
        this.matchingAgentIdsForAliasMap = aliasMap;
    }

    protected handleAliasSelectedModelIdChange = (alias: LanguageModelAlias, event: React.ChangeEvent<HTMLSelectElement>): void => {
        const newModelId = event.target.value || undefined;
        const updatedAlias: LanguageModelAlias = {
            ...alias,
            selectedModelId: newModelId
        };
        this.languageModelAliasRegistry.ready.then(() => {
            this.languageModelAliasRegistry.addAlias(updatedAlias);
        });
    };

    render(): React.ReactNode {
        const selectedAliasId = this.aiConfigurationSelectionService.getSelectedAliasId();
        const selectedAlias = this.aliases.find(alias => alias.id === selectedAliasId);
        return (
            <div className="model-alias-configuration-main">
                <div className="model-alias-configuration-list preferences-tree-widget theia-TreeContainer ai-model-alias-list">
                    <ul>
                        {this.aliases.map(alias => (
                            <li
                                key={alias.id}
                                className={`theia-TreeNode theia-CompositeTreeNode${alias.id === selectedAliasId ? ' theia-mod-selected' : ''}`}
                                onClick={() => this.aiConfigurationSelectionService.setSelectedAliasId(alias.id)}
                            >
                                <span>{alias.id}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="model-alias-configuration-panel preferences-editor-widget">
                    {selectedAlias ? this.renderAliasDetail(selectedAlias, this.languageModels) : (
                        <div>
                            {nls.localize('theia/ai/core/modelAliasesConfiguration/selectAlias', 'Please select a Model Alias.')}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    protected renderAliasDetail(alias: LanguageModelAlias, languageModels: LanguageModel[]): React.ReactNode {
        const availableModelIds = languageModels.map(m => m.id);
        const selectedModelId = alias.selectedModelId ?? '';
        const isInvalidModel = !!selectedModelId && !availableModelIds.includes(alias.selectedModelId ?? '');
        const agentIds = this.matchingAgentIdsForAliasMap.get(alias.id) || [];
        const agents = this.agentService.getAllAgents().filter(agent => agentIds.includes(agent.id));
        const resolvedModel = this.resolvedModelForAlias.get(alias.id);
        return (
            <div>
                <div className="settings-section-title settings-section-category-title ai-alias-detail-title">
                    <span>{alias.id}</span>
                </div>
                {alias.description && <div className="ai-alias-detail-description">{alias.description}</div>}
                <div className="ai-alias-detail-selected-model">
                    <label>{nls.localize('theia/ai/core/modelAliasesConfiguration/selectedModelId', 'Selected Model')}: </label>
                    <select
                        className={`theia-select template-variant-selector ${isInvalidModel ? 'error' : ''}`}
                        value={isInvalidModel ? 'invalid' : selectedModelId}
                        onChange={event => this.handleAliasSelectedModelIdChange(alias, event)}
                    >
                        {isInvalidModel && (
                            <option value="invalid" disabled>
                                {nls.localize('theia/ai/core/modelAliasesConfiguration/unavailableModel', 'Selected model is no longer available')}
                            </option>
                        )}
                        <option value="" className='ai-language-model-item-ready'>
                            {nls.localize('theia/ai/core/modelAliasesConfiguration/defaultList', '[Default list]')}
                        </option>
                        {[...languageModels]
                            .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id))
                            .map(model => {
                                const isNotReady = model.status.status !== 'ready';
                                return (
                                    <option
                                        key={model.id}
                                        value={model.id}
                                        className={isNotReady ? 'ai-language-model-item-not-ready' : 'ai-language-model-item-ready'}
                                        title={isNotReady && model.status.message ? model.status.message : undefined}
                                    >
                                        {model.name ?? model.id} {isNotReady ? '✗' : '✓'}
                                    </option>
                                );
                            }
                            )}
                    </select>
                </div>
                {alias.selectedModelId === undefined &&
                    <><div className="ai-alias-detail-defaults">
                        <ol>
                            {alias.defaultModelIds.map(modelId => {
                                const model = this.languageModels.find(m => m.id === modelId);
                                const isReady = model?.status.status === 'ready';
                                return (
                                    <li key={modelId}>
                                        {isReady ? (
                                            <span className={modelId === resolvedModel?.id ? 'ai-alias-priority-item-resolved' : 'ai-alias-priority-item-ready'}>
                                                {modelId} <span className="ai-model-status-ready"
                                                    title={nls.localize('theia/ai/core/modelAliasesConfiguration/modelReadyTooltip', 'Ready')}>✓</span>
                                            </span>
                                        ) : (
                                            <span className="ai-model-default-not-ready">
                                                {modelId} <span className="ai-model-status-not-ready"
                                                    title={nls.localize('theia/ai/core/modelAliasesConfiguration/modelNotReadyTooltip', 'Not ready')}>✗</span>
                                            </span>
                                        )}
                                    </li>
                                );
                            })}
                        </ol>
                    </div><div className="ai-alias-evaluates-to-container">
                            <label className="ai-alias-evaluates-to-label">{nls.localize('theia/ai/core/modelAliasesConfiguration/evaluatesTo', 'Evaluates to')}:</label>
                            {resolvedModel ? (
                                <span className="ai-alias-evaluates-to-value">
                                    {resolvedModel.name ?? resolvedModel.id}
                                    {resolvedModel.status.status === 'ready' ? (
                                        <span className="ai-model-status-ready"
                                            title={nls.localize('theia/ai/core/modelAliasesConfiguration/modelReadyTooltip', 'Ready')}>✓</span>
                                    ) : (
                                        <span className="ai-model-status-not-ready" title={resolvedModel.status.message
                                            || nls.localize('theia/ai/core/modelAliasesConfiguration/modelNotReadyTooltip', 'Not ready')}>✗</span>
                                    )}
                                </span>
                            ) : (
                                <span className="ai-alias-evaluates-to-unresolved">
                                    {nls.localize('theia/ai/core/modelAliasesConfiguration/noResolvedModel', 'No model ready for this alias.')}
                                </span>
                            )}
                        </div></>
                }
                <div className="ai-alias-detail-agents">
                    <label>{nls.localize('theia/ai/core/modelAliasesConfiguration/agents', 'Agents using this Alias')}:</label>
                    <ul>
                        {agents.length > 0 ? (
                            agents.map(agent => (
                                <li key={agent.id}>
                                    <span>{agent.name}</span>
                                    {agent.id !== agent.name && <span className="ai-alias-agent-id">({agent.id})</span>}
                                </li>
                            ))
                        ) : (
                            <span>{nls.localize('theia/ai/core/modelAliasesConfiguration/noAgents', 'No agents use this alias.')}</span>
                        )}
                    </ul>
                </div>
            </div >
        );
    }
}
