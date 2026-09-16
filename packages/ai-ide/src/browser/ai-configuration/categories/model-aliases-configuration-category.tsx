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

import { AgentService, AISettingsService, LANGUAGE_MODEL_ALIASES_PREFERENCE } from '@theia/ai-core';
import { FrontendLanguageModelRegistry, LanguageModel, LanguageModelRegistry, LanguageModelRequirement } from '@theia/ai-core/lib/common/language-model';
import { LanguageModelAlias, LanguageModelAliasRegistry } from '@theia/ai-core/lib/common/language-model-alias';
import { Emitter, Event, nls } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';
import { SelectOption } from '@theia/core/lib/browser/widgets/select-component';
import { DisposableCollection } from '@theia/core/lib/common';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import {
    AiConfigurationCategory,
    AiConfigurationCategoryId,
    AiConfigurationCategoryOrder,
    AiConfigurationItemStatus,
    AiConfigurationRenderContext,
    AiConfigurationSearchItem,
    AiConfigurationSearchProvider,
    AiConfigurationTreeItem
} from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { CollectionCategoryRenderer } from '@theia/ai-core-ui/lib/browser/ai-configuration/renderers/collection-category-renderer';
import { AiConfigurationSection } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-primitives';
import { AiEnumSelect } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-controls';
import { AgentChips } from './agent-chips';

/** Sentinel option value representing "use the alias' default priority list" (no explicit model). */
const DEFAULT_LIST_VALUE = '';

/**
 * The Model Aliases category: a `collection` porting the alias configuration onto the shared
 * primitives. The per-item detail (selected model, priority list, resolved model, agents using
 * the alias) is rendered synchronously from caches refreshed on the relevant service events.
 */
@injectable()
export class ModelAliasesConfigurationCategory extends CollectionCategoryRenderer implements AiConfigurationCategory, AiConfigurationSearchProvider {

    readonly id = AiConfigurationCategoryId.MODEL_ALIASES;
    readonly label = nls.localize('theia/ai/core/modelAliasesConfiguration/label', 'Model Aliases');
    readonly description = nls.localize('theia/ai/core/modelAliasesConfiguration/description',
        'Named references to a preferred model, so agents can target a role instead of a specific model.');
    readonly iconClass = codicon('symbol-namespace');
    readonly order = AiConfigurationCategoryOrder.MODEL_ALIASES;
    readonly kind = 'collection' as const;

    @inject(LanguageModelAliasRegistry)
    protected readonly languageModelAliasRegistry: LanguageModelAliasRegistry;

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: FrontendLanguageModelRegistry;

    @inject(AISettingsService)
    protected readonly aiSettingsService: AISettingsService;

    @inject(AgentService)
    protected readonly agentService: AgentService;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    protected aliases: LanguageModelAlias[] = [];
    protected languageModels: LanguageModel[] = [];
    protected matchingAgentIdsForAlias = new Map<string, string[]>();
    protected resolvedModelForAlias = new Map<string, LanguageModel | undefined>();

    get renderer(): this {
        return this;
    }

    getOwnedPreferenceIds(): string[] {
        return [LANGUAGE_MODEL_ALIASES_PREFERENCE];
    }

    get search(): AiConfigurationSearchProvider {
        return this;
    }

    @postConstruct()
    protected init(): void {
        Promise.all([this.loadAliases(), this.loadLanguageModels()]).then(() => this.onDidChangeEmitter.fire());
        this.languageModelAliasRegistry.ready.then(() =>
            this.toDispose.push(this.languageModelAliasRegistry.onDidChange(() => this.reload()))
        );
        this.toDispose.pushAll([
            this.languageModelRegistry.onChange(async () => {
                await this.loadLanguageModels();
                await this.loadAliases();
                this.onDidChangeEmitter.fire();
            }),
            this.aiSettingsService.onDidChange(async () => {
                await this.loadMatchingAgents();
                this.onDidChangeEmitter.fire();
            })
        ]);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected async reload(): Promise<void> {
        await this.loadAliases();
        this.onDidChangeEmitter.fire();
    }

    protected async loadLanguageModels(): Promise<void> {
        this.languageModels = await this.languageModelRegistry.getLanguageModels();
    }

    protected async loadAliases(): Promise<void> {
        await this.languageModelAliasRegistry.ready;
        this.aliases = this.languageModelAliasRegistry.getAliases().sort((a, b) => a.id.localeCompare(b.id));
        await this.loadMatchingAgents();
        this.resolvedModelForAlias = new Map();
        for (const alias of this.aliases) {
            this.resolvedModelForAlias.set(alias.id, await this.languageModelRegistry.getReadyLanguageModel(alias.id));
        }
    }

    protected async loadMatchingAgents(): Promise<void> {
        const agents = this.agentService.getAllAgents();
        const aliasMap = new Map<string, string[]>();
        for (const alias of this.aliases) {
            const matchingAgentIds: string[] = [];
            for (const agent of agents) {
                const requirementSetting = await this.aiSettingsService.getAgentSettings(agent.id);
                if (requirementSetting?.languageModelRequirements) {
                    if (requirementSetting.languageModelRequirements.find(requirement => requirement.identifier === alias.id)) {
                        matchingAgentIds.push(agent.id);
                    }
                } else if (agent.languageModelRequirements.some((requirement: LanguageModelRequirement) => requirement.identifier === alias.id)) {
                    matchingAgentIds.push(agent.id);
                }
            }
            aliasMap.set(alias.id, matchingAgentIds);
        }
        this.matchingAgentIdsForAlias = aliasMap;
    }

    protected get categoryId(): string {
        return this.id;
    }

    getTreeChildren(): AiConfigurationTreeItem[] {
        return this.aliases.map(alias => ({
            id: alias.id,
            label: alias.id,
            description: alias.description,
            status: this.getAliasStatus(alias)
        } satisfies AiConfigurationTreeItem));
    }

    protected getAliasStatus(alias: LanguageModelAlias): AiConfigurationItemStatus {
        const resolved = this.resolvedModelForAlias.get(alias.id);
        if (!resolved) {
            return {
                kind: 'error',
                label: nls.localize('theia/ai/core/modelAliasesConfiguration/noModel', 'No model'),
                tooltip: nls.localize('theia/ai/core/modelAliasesConfiguration/noResolvedModel', 'No model ready for this alias.')
            };
        }
        const modelName = resolved.name ?? resolved.id;
        if (resolved.status.status !== 'ready') {
            return {
                kind: 'warn',
                label: nls.localize('theia/ai/core/modelAliasesConfiguration/notReady', 'Not ready'),
                tooltip: resolved.status.message
            };
        }
        // Show what the alias actually resolves to rather than a generic "Ready", so the badge is informative.
        return {
            kind: 'on',
            label: modelName,
            tooltip: nls.localize('theia/ai/core/modelAliasesConfiguration/resolvesTo', 'Resolves to {0}', modelName)
        };
    }

    protected renderItemSections(item: AiConfigurationTreeItem, ctx: AiConfigurationRenderContext): React.ReactNode {
        const alias = this.aliases.find(candidate => candidate.id === item.id);
        if (!alias) {
            return undefined;
        }
        return <>
            {this.renderSelectedModel(alias)}
            {alias.selectedModelId === undefined && this.renderPriorityList(alias)}
            {this.renderAgentsUsingAlias(alias, ctx)}
        </>;
    }

    protected renderSelectedModel(alias: LanguageModelAlias): React.ReactNode {
        const options = this.getModelOptions();
        const selected = alias.selectedModelId ?? DEFAULT_LIST_VALUE;
        const isInvalid = !!alias.selectedModelId && !this.languageModels.some(model => model.id === alias.selectedModelId);
        return <AiConfigurationSection title={nls.localize('theia/ai/core/modelAliasesConfiguration/selectedModelId', 'Selected Model')}>
            {isInvalid && <div className='ai-alias-invalid-model'>
                {nls.localize('theia/ai/core/modelAliasesConfiguration/unavailableModel', 'Selected model is no longer available')}
            </div>}
            <AiEnumSelect
                ariaLabel={nls.localize('theia/ai/core/modelAliasesConfiguration/selectedModelId', 'Selected Model')}
                value={isInvalid ? undefined : selected}
                invalid={isInvalid}
                options={options.map(option => ({ value: String(option.value ?? ''), label: option.label ?? String(option.value ?? ''), title: option.description }))}
                onCommit={value => this.setSelectedModel(alias, value)}
            />
        </AiConfigurationSection>;
    }

    protected getModelOptions(): SelectOption[] {
        const options: SelectOption[] = [{
            value: DEFAULT_LIST_VALUE,
            label: nls.localize('theia/ai/core/modelAliasesConfiguration/defaultList', '[Default list]')
        }];
        for (const model of [...this.languageModels].sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id))) {
            const ready = model.status.status === 'ready';
            options.push({
                value: model.id,
                label: `${model.name ?? model.id} ${ready ? '✓' : '✗'}`,
                description: !ready ? model.status.message : undefined
            });
        }
        return options;
    }

    protected setSelectedModel(alias: LanguageModelAlias, value: string | undefined): void {
        const selectedModelId = value ? value : undefined;
        this.languageModelAliasRegistry.ready.then(() => this.languageModelAliasRegistry.addAlias({ ...alias, selectedModelId }));
    }

    protected renderPriorityList(alias: LanguageModelAlias): React.ReactNode {
        const resolved = this.resolvedModelForAlias.get(alias.id);
        return <>
            <AiConfigurationSection title={nls.localize('theia/ai/core/modelAliasesConfiguration/priorityList', 'Priority List')}>
                <ol>
                    {alias.defaultModelIds.map(modelId => {
                        const model = this.languageModels.find(candidate => candidate.id === modelId);
                        const ready = model?.status.status === 'ready';
                        return <li key={modelId} className={modelId === resolved?.id ? 'ai-alias-priority-item-resolved' : undefined}>
                            {modelId} {ready ? '✓' : '✗'}
                        </li>;
                    })}
                </ol>
            </AiConfigurationSection>
            <AiConfigurationSection title={nls.localize('theia/ai/core/modelAliasesConfiguration/evaluatesTo', 'Evaluates to')}>
                {resolved
                    ? <span>{resolved.name ?? resolved.id} {resolved.status.status === 'ready' ? '✓' : '✗'}</span>
                    : <span>{nls.localize('theia/ai/core/modelAliasesConfiguration/noResolvedModel', 'No model ready for this alias.')}</span>}
            </AiConfigurationSection>
        </>;
    }

    protected renderAgentsUsingAlias(alias: LanguageModelAlias, ctx: AiConfigurationRenderContext): React.ReactNode {
        const agentIds = this.matchingAgentIdsForAlias.get(alias.id) ?? [];
        const agents = this.agentService.getAllAgents().filter(agent => agentIds.includes(agent.id));
        return <AiConfigurationSection title={nls.localize('theia/ai/core/modelAliasesConfiguration/agents', 'Agents using this Alias')}>
            {agents.length > 0
                ? <AgentChips agents={agents} onOpenAgent={agentId => ctx.navigate({ categoryId: AiConfigurationCategoryId.AGENTS, itemId: agentId })} />
                : <span>{nls.localize('theia/ai/core/modelAliasesConfiguration/noAgents', 'No agents use this alias.')}</span>}
        </AiConfigurationSection>;
    }

    getSearchItems(): AiConfigurationSearchItem[] {
        const typeLabel = nls.localize('theia/ai/core/modelAliasesConfiguration/aliasTypeLabel', 'Model Alias');
        return this.aliases.map(alias => ({
            label: alias.id,
            typeLabel,
            categoryId: this.id,
            target: { categoryId: this.id, itemId: alias.id },
            keywords: alias.description ?? ''
        } satisfies AiConfigurationSearchItem));
    }
}
