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
import { FrontendLanguageModelRegistry, LanguageModel, LanguageModelRegistry } from '@theia/ai-core/lib/common/language-model';
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

        this.loadAliases();
        this.loadLanguageModels();
        this.loadMatchingAgentIdsForAllAliases();
        this.update();

        this.languageModelAliasRegistry.ready.then(() =>
            this.toDispose.push(this.languageModelAliasRegistry.onDidChange(async () => {
                await this.loadAliases();
                this.update();
            }))
        );

        this.toDispose.pushAll([
            this.languageModelRegistry.onChange(async () => {
                await this.loadAliases();
                this.loadLanguageModels();
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

    protected loadLanguageModels(): void {
        this.languageModelRegistry.getLanguageModels().then(models => {
            this.languageModels = models;
        });
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
                if (requirementSetting?.languageModelRequirements?.find(e => e.identifier === alias.id)) {
                    matchingAgentIds.push(agent.id);
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
                        className="theia-select"
                        value={alias.selectedModelId ?? ''}
                        onChange={event => this.handleAliasSelectedModelIdChange(alias, event)}
                    >
                        <option value="" className="ai-model-alias-option-bold">
                            {nls.localize('theia/ai/core/modelAliasesConfiguration/fallback', '[Fallback to defaults]')}
                        </option>
                        {[...languageModels]
                            .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id))
                            .map(model => {
                                const isNotReady = model.status.status !== 'ready';
                                return (
                                    <option
                                        key={model.id}
                                        value={model.id}
                                        disabled={isNotReady}
                                        className={isNotReady ? 'ai-model-option-not-ready' : 'ai-model-option-bold'}
                                        title={isNotReady && model.status.message ? model.status.message : undefined}
                                    >
                                        {model.name ?? model.id}
                                    </option>
                                );
                            }
                            )}
                    </select>
                </div>
                <div className="ai-alias-detail-defaults">
                    <label>{nls.localize('theia/ai/core/modelAliasesConfiguration/defaults', 'Default Model IDs (priority order)')}:</label>
                    <ol>
                        {alias.defaultModelIds.map(modelId => {
                            const model = this.languageModels.find(m => m.id === modelId);
                            const isReady = model?.status.status === 'ready';
                            return (
                                <li key={modelId}>
                                    {isReady ? (
                                        <span className="ai-model-option-bold">
                                            {modelId} <span className="ai-model-status-ready" title="Ready">✓</span>
                                        </span>
                                    ) : (
                                        <span className="ai-model-default-not-ready">
                                            {modelId} <span className="ai-model-status-not-ready" title="Not ready">✗</span>
                                        </span>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                    <div className="ai-alias-defaults-hint">
                        {nls.localize(
                            'theia/ai/core/modelAliasesConfiguration/defaultsHierarchy',
                            'When no model is explicitly selected, the first available default model will be used.'
                        )}
                    </div>
                </div>
                <div className="ai-alias-evaluates-to-container">
                    <label className="ai-alias-evaluates-to-label">{nls.localize('theia/ai/core/modelAliasesConfiguration/evaluatesTo', 'Evaluates to')}:</label>
                    {resolvedModel ? (
                        <span className="ai-alias-evaluates-to-value">
                            {resolvedModel.name ?? resolvedModel.id}
                            {resolvedModel.status.status === 'ready' ? (
                                <span className="ai-model-status-ready" title="Ready">✓</span>
                            ) : (
                                <span className="ai-model-status-not-ready" title={resolvedModel.status.message || 'Not ready'}>✗</span>
                            )}
                        </span>
                    ) : (
                        <span className="ai-alias-evaluates-to-unresolved">
                            {nls.localize('theia/ai/core/modelAliasesConfiguration/noResolvedModel', 'No model ready for this alias.')}
                        </span>
                    )}
                </div>
                <div className="ai-alias-detail-agents">
                    <label>{nls.localize('theia/ai/core/modelAliasesConfiguration/agents', 'Agents using this Alias')}:</label>
                    {agents.length > 0 ? (
                        <ul>
                            {agents.map(agent => (
                                <li key={agent.id}>
                                    <span>{agent.name}</span>
                                    <span className="ai-alias-agent-id">({agent.id})</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="ai-alias-no-agents">
                            {nls.localize('theia/ai/core/modelAliasesConfiguration/noAgents', 'No agents use this alias.')}
                        </div>
                    )}
                </div>
            </div >
        );
    }
}
