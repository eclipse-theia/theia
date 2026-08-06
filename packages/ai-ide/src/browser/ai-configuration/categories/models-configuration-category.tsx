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

import { Emitter, Event, nls } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';
import { DisposableCollection } from '@theia/core/lib/common';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import {
    AiConfigurationCategory,
    AiConfigurationCategoryId,
    AiConfigurationCategoryOrder,
    AiConfigurationRenderContext,
    AiConfigurationSearchItem,
    AiConfigurationSearchProvider,
    AiConfigurationTreeItem
} from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { AiSettingsRowService } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row-service';
import { AiConfigurationSection } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-primitives';
import { CollectionCategoryRenderer } from '@theia/ai-core-ui/lib/browser/ai-configuration/renderers/collection-category-renderer';
import { AiSettingsRow } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row';

/** Prefix shared by every AI preference. */
const AI_FEATURES_PREFIX = 'ai-features.';

/** Id of the cross-provider "Model Settings" section (kept in the overview, not a provider node). */
const MODEL_SETTINGS_ID = 'model-settings';

/** Segments that make up the cross-provider "Model Settings" section. */
const MODEL_SETTINGS_SEGMENTS = new Set<string>(['modelSettings', 'reasoning']);

interface ModelsSection {
    readonly id: string;
    readonly title: string;
    readonly preferenceIds: string[];
}

/**
 * The Models category: a `collection` listing each language-model provider as a tree child, so
 * providers appear as nodes under the Models category. Provider blocks are discovered from the
 * registered `ai-features.<provider>.*` preferences, so any installed provider package contributes
 * a node here without ai-ide having to depend on it.
 *
 * The page layout comes from {@link CollectionCategoryRenderer}, like the other collection categories:
 * the overview shows the cross-provider model settings (`ai-features.modelSettings.*`,
 * `ai-features.reasoning.*`) above the provider cards, and selecting a provider node shows that
 * provider's settings.
 */
@injectable()
export class ModelsConfigurationCategory extends CollectionCategoryRenderer implements AiConfigurationCategory, AiConfigurationSearchProvider {

    readonly id = AiConfigurationCategoryId.MODELS;
    readonly label = nls.localize('theia/ai/core/aiConfiguration/models/label', 'Providers & Models');
    readonly description = nls.localize('theia/ai/ide/modelsConfiguration/description',
        'Configure language-model providers and the models available to agents.');
    readonly iconClass = codicon('cloud');
    readonly order = AiConfigurationCategoryOrder.MODELS;
    readonly kind = 'collection' as const;

    @inject(AiSettingsRowService)
    protected readonly settingsRowService: AiSettingsRowService;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    get renderer(): this {
        return this;
    }

    protected get categoryId(): string {
        return this.id;
    }

    getOwnedPreferenceIds(): string[] {
        return this.getSections().flatMap(section => section.preferenceIds);
    }

    get search(): AiConfigurationSearchProvider {
        return this;
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.settingsRowService.onPreferenceChanged(() => this.onDidChangeEmitter.fire()));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    /**
     * One tree child per discovered provider (the cross-provider model settings stay in the overview).
     * Each carries the category icon so the overview cards show it; the tree nodes fall back to it anyway.
     */
    getTreeChildren(): AiConfigurationTreeItem[] {
        return this.getProviderSections().map(section => ({
            id: section.id,
            label: section.title,
            iconClass: this.iconClass
        } satisfies AiConfigurationTreeItem));
    }

    protected override get overviewListTitle(): string {
        return nls.localize('theia/ai/ide/modelsConfiguration/providers', 'Providers');
    }

    protected override getEmptyMessage(): string {
        return nls.localize('theia/ai/ide/modelsConfiguration/noProviders', 'No language-model providers are installed.');
    }

    /** Shown above the provider cards: the cross-provider model settings, when any are registered. */
    protected override renderCategorySettings(ctx: AiConfigurationRenderContext): React.ReactNode {
        const modelSettings = this.getModelSettingsSection();
        return modelSettings && <AiConfigurationSection title={modelSettings.title}>
            {modelSettings.preferenceIds.map(preferenceId => this.renderPreferenceRow(ctx, preferenceId))}
        </AiConfigurationSection>;
    }

    /** Provider detail (node selected): that provider's settings. */
    protected renderItemSections(item: AiConfigurationTreeItem, ctx: AiConfigurationRenderContext): React.ReactNode {
        const section = this.getProviderSections().find(candidate => candidate.id === item.id);
        if (!section) {
            return undefined;
        }
        return <AiConfigurationSection title={nls.localizeByDefault('Settings')}>
            {section.preferenceIds.map(preferenceId => this.renderPreferenceRow(ctx, preferenceId))}
        </AiConfigurationSection>;
    }

    protected renderPreferenceRow(ctx: AiConfigurationRenderContext, preferenceId: string): React.ReactNode {
        return <AiSettingsRow
            key={preferenceId}
            service={this.settingsRowService}
            preferenceId={preferenceId}
            scope={ctx.scope}
            control={this.settingsRowService.controlFor(preferenceId)}
            onDidChange={() => ctx.update()}
        />;
    }

    /** Discovers the model-settings and provider sections from the registered preference schema. */
    protected getSections(): ModelsSection[] {
        const displayable = this.settingsRowService.aiFeaturePreferenceIds();

        // A `ai-features.<segment>.*` block is a provider block only when at least one of its preferences
        // positively declares the `aiModelProvider` typeDetail (the same marker used to label the block).
        // This replaces a hand-maintained denylist of non-provider segments: an unknown feature area that
        // never claims to be a provider is no longer mistaken for one — it falls through to the General
        // catch-all instead of showing up as a bogus provider block.
        const providerSegments = new Set<string>();
        for (const preferenceId of displayable) {
            if (this.settingsRowService.isModelProviderPreference(preferenceId)) {
                providerSegments.add(this.segmentOf(preferenceId));
            }
        }

        const modelSettings: string[] = [];
        const byProvider = new Map<string, string[]>();
        for (const preferenceId of displayable) {
            const segment = this.segmentOf(preferenceId);
            if (MODEL_SETTINGS_SEGMENTS.has(segment)) {
                modelSettings.push(preferenceId);
            } else if (providerSegments.has(segment)) {
                const block = byProvider.get(segment) ?? [];
                block.push(preferenceId);
                byProvider.set(segment, block);
            }
        }

        const sections: ModelsSection[] = [];
        if (modelSettings.length > 0) {
            sections.push({
                id: MODEL_SETTINGS_ID,
                title: nls.localize('theia/ai/ide/modelsConfiguration/modelSettings', 'Model Settings'),
                preferenceIds: modelSettings
            });
        }
        const providerSections = Array.from(byProvider.entries()).map(([provider, preferenceIds]) => ({
            id: provider,
            title: this.getProviderLabel(provider, preferenceIds),
            preferenceIds
        } satisfies ModelsSection));
        // Order provider nodes by the label the user actually sees, not by the raw preference segment.
        providerSections.sort((left, right) => left.title.localeCompare(right.title));
        sections.push(...providerSections);
        return sections;
    }

    /**
     * The human-readable display name for a provider block. A provider declares it in its preference
     * schema (via the `aiModelProvider` `typeDetails`, `MODEL_PROVIDER_TYPE_DETAIL`), so this
     * package does not have to know provider names. Providers that declare no name (e.g. third-party
     * packages) fall back to a prettified form of the `ai-features.<provider>.*` segment.
     */
    protected getProviderLabel(providerId: string, preferenceIds: string[]): string {
        for (const preferenceId of preferenceIds) {
            const declared = this.settingsRowService.modelProviderLabel(preferenceId);
            if (declared) {
                return declared;
            }
        }
        return this.prettifyProviderId(providerId);
    }

    /** The `ai-features.<segment>.…` area segment of a preference id, e.g. `ai-features.google.apiKey` → `google`. */
    protected segmentOf(preferenceId: string): string {
        return preferenceId.substring(AI_FEATURES_PREFIX.length).split('.')[0];
    }

    /** Turns an unknown provider segment such as `myProvider` or `my-provider` into `My Provider`. */
    protected prettifyProviderId(providerId: string): string {
        const spaced = providerId
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/[-_]+/g, ' ')
            .trim();
        return spaced.charAt(0).toUpperCase() + spaced.slice(1);
    }

    /** The cross-provider "Model Settings" section, if any settings are registered for it. */
    protected getModelSettingsSection(): ModelsSection | undefined {
        return this.getSections().find(section => section.id === MODEL_SETTINGS_ID);
    }

    /** The provider sections (everything except the cross-provider "Model Settings"). */
    protected getProviderSections(): ModelsSection[] {
        return this.getSections().filter(section => section.id !== MODEL_SETTINGS_ID);
    }

    getSearchItems(): AiConfigurationSearchItem[] {
        const settingLabel = nls.localizeByDefault('Setting');
        return this.getSections().flatMap(section => {
            // Provider settings live in the provider's node; model settings live in the overview.
            const isProvider = section.id !== MODEL_SETTINGS_ID;
            return section.preferenceIds.map(preferenceId => {
                const described = this.settingsRowService.describe(preferenceId);
                return {
                    label: described.label ?? preferenceId,
                    typeLabel: settingLabel,
                    categoryId: this.id,
                    target: {
                        categoryId: this.id,
                        itemId: isProvider ? section.id : undefined,
                        highlight: { rowId: preferenceId }
                    },
                    keywords: `${preferenceId} ${section.title}`
                } satisfies AiConfigurationSearchItem;
            });
        });
    }
}
