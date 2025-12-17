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
import { LanguageModelAliasRegistry, LanguageModelAlias } from '@theia/ai-core/lib/common/language-model-alias';
import { FrontendLanguageModelRegistry, LanguageModel, LanguageModelRegistry, LanguageModelRequirement } from '@theia/ai-core/lib/common/language-model';
import { nls } from '@theia/core/lib/common/nls';
import { AgentService, AISettingsService } from '@theia/ai-core';
import { AIListDetailConfigurationWidget } from './base/ai-list-detail-configuration-widget';
import { ConfigurationSection } from './components/configuration-section';

@injectable()
export class ModelAliasesConfigurationWidget extends AIListDetailConfigurationWidget<LanguageModelAlias> {
    static readonly ID = 'ai-model-aliases-configuration-widget';
    static readonly LABEL = nls.localize('theia/ai/core/modelAliasesConfiguration/label', 'Model Aliases');

    @inject(LanguageModelAliasRegistry)
    protected readonly languageModelAliasRegistry: LanguageModelAliasRegistry;
    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: FrontendLanguageModelRegistry;
    @inject(AISettingsService)
    protected readonly aiSettingsService: AISettingsService;
    @inject(AgentService)
    protected readonly agentService: AgentService;

    protected languageModels: LanguageModel[] = [];
    protected matchingAgentIdsForAliasMap: Map<string, string[]> = new Map();
    protected resolvedModelForAlias: Map<string, LanguageModel | undefined> = new Map();

    @postConstruct()
    protected init(): void {
        this.id = ModelAliasesConfigurationWidget.ID;
        this.title.label = ModelAliasesConfigurationWidget.LABEL;
        this.title.closable = false;

        Promise.all([
            this.loadItems(),
            this.loadLanguageModels()
        ]).then(() => this.update());

        this.languageModelAliasRegistry.ready.then(() =>
            this.toDispose.push(this.languageModelAliasRegistry.onDidChange(async () => {
                await this.loadItems();
                this.update();
            }))
        );

        this.toDispose.pushAll([
            this.languageModelRegistry.onChange(async () => {
                await this.loadItems();
                await this.loadLanguageModels();
                this.update();
            }),
            this.aiSettingsService.onDidChange(async () => {
                await this.loadMatchingAgentIdsForAllAliases();
                this.update();
            })
        ]);
    }

    protected override async loadItems(): Promise<void> {
        await this.languageModelAliasRegistry.ready;
        this.items = this.languageModelAliasRegistry.getAliases();

        // Set initial selection
        if (this.items.length > 0 && !this.selectedItem) {
            this.selectedItem = this.items[0];
        }

        await this.loadMatchingAgentIdsForAllAliases();

        // Resolve evaluated models for each alias
        this.resolvedModelForAlias = new Map();
        for (const alias of this.items) {
            const model = await this.languageModelRegistry.getReadyLanguageModel(alias.id);
            this.resolvedModelForAlias.set(alias.id, model);
        }
    }

    protected async loadLanguageModels(): Promise<void> {
        this.languageModels = await this.languageModelRegistry.getLanguageModels();
    }

    protected async loadMatchingAgentIdsForAllAliases(): Promise<void> {
        const agents = this.agentService.getAllAgents();
        const aliasMap: Map<string, string[]> = new Map();
        for (const alias of this.items) {
            const matchingAgentIds: string[] = [];
            for (const agent of agents) {
                const requirementSetting = await this.aiSettingsService.getAgentSettings(agent.id);
                if (requirementSetting?.languageModelRequirements) {
                    if (requirementSetting?.languageModelRequirements?.find(e => e.identifier === alias.id)) {
                        matchingAgentIds.push(agent.id);
                    }
                } else {
                    if (agent.languageModelRequirements.some((req: LanguageModelRequirement) => req.identifier === alias.id)) {
                        matchingAgentIds.push(agent.id);
                    }
                }
            }
            aliasMap.set(alias.id, matchingAgentIds);
        }
        this.matchingAgentIdsForAliasMap = aliasMap;
    }

    protected override getItemId(item: LanguageModelAlias): string {
        return item.id;
    }

    protected override getItemLabel(item: LanguageModelAlias): string {
        return item.id;
    }

    protected override getEmptySelectionMessage(): string {
        return nls.localize('theia/ai/core/modelAliasesConfiguration/selectAlias', 'Please select a Model Alias.');
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
        this.handleItemSelect(updatedAlias);
    };

    protected override renderItemDetail(alias: LanguageModelAlias): React.ReactNode {
        const availableModelIds = this.languageModels.map(m => m.id);
        const selectedModelId = alias.selectedModelId ?? '';
        const isInvalidModel = !!selectedModelId && !availableModelIds.includes(alias.selectedModelId ?? '');
        const agentIds = this.matchingAgentIdsForAliasMap.get(alias.id) || [];
        const agents = this.agentService.getAllAgents().filter(agent => agentIds.includes(agent.id));
        const resolvedModel = this.resolvedModelForAlias.get(alias.id);

        return (
            <div>
                <div className="settings-section-title settings-section-category-title">
                    {alias.id}
                </div>

                {alias.description && (
                    <div className="ai-alias-detail-description">{alias.description}</div>
                )}

                <ConfigurationSection
                    title={nls.localize('theia/ai/core/modelAliasesConfiguration/selectedModelId', 'Selected Model')}
                    className="ai-alias-selected-model-section"
                >
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
                        {[...this.languageModels]
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
                </ConfigurationSection>

                {alias.selectedModelId === undefined && (
                    <>
                        <ConfigurationSection
                            title={nls.localize('theia/ai/core/modelAliasesConfiguration/priorityList', 'Priority List')}
                            className="ai-alias-defaults-section"
                        >
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
                        </ConfigurationSection>

                        <ConfigurationSection
                            title={nls.localize('theia/ai/core/modelAliasesConfiguration/evaluatesTo', 'Evaluates to')}
                            className="ai-alias-evaluates-to-section"
                        >
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
                        </ConfigurationSection>
                    </>
                )}

                <ConfigurationSection
                    title={nls.localize('theia/ai/core/modelAliasesConfiguration/agents', 'Agents using this Alias')}
                    className="ai-alias-agents-section"
                >
                    <ul>
                        {agents.length > 0 ? (
                            agents.map(agent => (
                                <li key={agent.id}>
                                    <span>{agent.name}</span>
                                    {agent.id !== agent.name && <span className="ai-alias-agent-id"> ({agent.id})</span>}
                                </li>
                            ))
                        ) : (
                            <span>{nls.localize('theia/ai/core/modelAliasesConfiguration/noAgents', 'No agents use this alias.')}</span>
                        )}
                    </ul>
                </ConfigurationSection>
            </div>
        );
    }
}
