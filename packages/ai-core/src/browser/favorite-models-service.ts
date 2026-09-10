// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { Emitter, Event, PreferenceScope, PreferenceService } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { PREFERENCE_NAME_FAVORITE_MODELS } from '../common/ai-core-preferences';
import { LanguageModelAliasRegistry } from '../common/language-model-alias';
import { DiscoveredModel, ModelDiscoveryStatus } from '../common/model-discovery-status';
import { DiscoveredModels } from '../common/model-discovery-util';
import { ModelDiscoveryStatusService } from './model-discovery-status-service';

/**
 * How many of a provider's models are offered without the user asking. Enough to cover a provider's
 * current line-up (a flagship, a fast one, a cheap one and their immediate predecessors) without
 * turning the model pickers back into a catalogue.
 */
export const FEATURED_MODEL_COUNT = 5;

/** What {@link FavoriteModelsService} derives from what the providers last reported. */
export interface DerivedFavorites {
    /** Fully qualified ids of the models that are offered without the user asking. */
    readonly featured: Set<string>;
    /** Model-id prefixes of the providers that participate in discovery. */
    readonly discoveryPrefixes: Set<string>;
}

/**
 * Decides which models the model picker in the AI chat input offers.
 *
 * Discovery registers everything a provider offers, including one entry per release, which is far
 * more than anyone picks between while chatting. What that picker shows is therefore the *favorites*:
 * the models that are featured automatically plus the ones the user marked. Everywhere a model is
 * chosen deliberately — an agent's model, a model alias — every discovered model stays on offer.
 *
 * A model is featured when it is one of the {@link FEATURED_MODEL_COUNT} most recently released
 * undated ids of its provider — so `claude-opus-5` is featured while `claude-opus-5-20260401` is
 * not. Because the featured set is derived from each discovery rather than stored, a model released
 * tomorrow is offered the day it appears, and the user cannot end up pinned to a stale line-up.
 * Featured models cannot be unmarked for the same reason: they are the floor the picker stands on.
 *
 * Models of a provider that does not participate in discovery — one whose models are configured by
 * hand, or a custom endpoint — are all favorites: listing them *was* the user's choice.
 */
@injectable()
export class FavoriteModelsService {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(ModelDiscoveryStatusService)
    protected readonly discoveryStatus: ModelDiscoveryStatusService;

    @inject(LanguageModelAliasRegistry)
    protected readonly aliasRegistry: LanguageModelAliasRegistry;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    /** Fired when the marked models or the featured set change. */
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    /** Memoized {@link getDerived}, dropped whenever discovery or the aliases change. */
    protected derived: DerivedFavorites | undefined;

    @postConstruct()
    protected init(): void {
        this.discoveryStatus.onDidChange(status => {
            this.derived = undefined;
            this.pruneFavorites(status);
            this.onDidChangeEmitter.fire();
        });
        // An alias points at the models the application considers current, so what it names is featured.
        this.aliasRegistry.onDidChange(() => {
            this.derived = undefined;
            this.onDidChangeEmitter.fire();
        });
        this.preferenceService.onPreferenceChanged(event => {
            if (event.preferenceName === PREFERENCE_NAME_FAVORITE_MODELS) {
                this.onDidChangeEmitter.fire();
            }
        });
    }

    /** Whether the chat input's model picker offers this model, be it featured, marked or hand-configured. */
    isFavorite(modelId: string): boolean {
        // Nothing was discovered for this model's provider, so its models are there because someone put
        // them there - a manually configured provider, or a custom endpoint. That is choice enough.
        if (!this.participatesInDiscovery(modelId)) {
            return true;
        }
        return this.isFeatured(modelId) || this.getFavorites().includes(modelId);
    }

    /** Whether the model's provider reports a discovery status, i.e. whether featuring applies to it at all. */
    protected participatesInDiscovery(modelId: string): boolean {
        const separator = modelId.indexOf('/');
        if (separator <= 0) {
            return false;
        }
        return this.getDerived().discoveryPrefixes.has(modelId.substring(0, separator));
    }

    /**
     * Whether the model is offered automatically because it is among its provider's newest, in which
     * case it cannot be unmarked.
     */
    isFeatured(modelId: string): boolean {
        return this.getFeatured().has(modelId);
    }

    /** The ids the user marked explicitly, featured models excluded. */
    getFavorites(): string[] {
        return this.preferenceService.get<string[]>(PREFERENCE_NAME_FAVORITE_MODELS, []);
    }

    /**
     * Marks or unmarks a model. A featured model is offered regardless, so marking it would have no
     * effect and unmarking it is refused rather than silently ignored.
     */
    async toggleFavorite(modelId: string): Promise<void> {
        if (this.isFeatured(modelId)) {
            return;
        }
        const favorites = this.getFavorites();
        const next = favorites.includes(modelId)
            ? favorites.filter(id => id !== modelId)
            : [...favorites, modelId];
        await this.preferenceService.set(PREFERENCE_NAME_FAVORITE_MODELS, next, PreferenceScope.User);
    }

    /** The featured ids across all providers that participate in discovery, fully qualified. */
    protected getFeatured(): Set<string> {
        return this.getDerived().featured;
    }

    /**
     * What the last discovery implies, computed once and kept until it changes. The chat input asks
     * per model on every render, and ranking each provider's models per question would mean sorting
     * the whole catalogue as many times as it has entries.
     */
    protected getDerived(): DerivedFavorites {
        if (!this.derived) {
            const featured = new Set<string>();
            const discoveryPrefixes = new Set<string>();
            for (const status of this.discoveryStatus.getStatuses()) {
                const prefix = status.modelIdPrefix ?? status.providerId;
                discoveryPrefixes.add(prefix);
                for (const model of this.selectFeatured(status)) {
                    featured.add(`${prefix}/${model.id}`);
                }
            }
            this.derived = { featured, discoveryPrefixes };
        }
        return this.derived;
    }

    /**
     * The models of one provider that are offered automatically: at most {@link FEATURED_MODEL_COUNT}
     * of its undated ids. A release-pinned id is never featured — the undated form of the same model
     * already is, and pinning a release is the deliberate choice the switch on its row makes.
     *
     * They are ranked by what evidence there is, in that order:
     *
     * 1. named by a built-in model alias, which is where the application states which models it
     *    considers current, and is the only signal a provider that reports nothing else leaves;
     * 2. most recently released, where the provider reports release dates (Anthropic, OpenAI);
     * 3. highest version in the id, which is what is left for Gemini and the Copilot CLI — the naming
     *    of those models carries their generation (`gemini-3.7-flash` over `gemini-2.5-pro`).
     *
     * An explicitly configured list (`modelOverrides`) is featured in full: the user named it. So is a
     * provider's own nomination ({@link DiscoveredModel.featured}), which a provider makes when the
     * generic ranking cannot serve it — Copilot carries models of many vendors and nominates one each
     * of the three the other providers offer directly, where "the newest five" would pick five of
     * whichever vendor numbers its models highest.
     */
    protected selectFeatured(status: ModelDiscoveryStatus): DiscoveredModel[] {
        const discovered = status.discovered ?? [];
        if (status.state === 'overridden') {
            return [...discovered];
        }
        const prefix = status.modelIdPrefix ?? status.providerId;
        const aliased = this.getAliasedModelIds();
        const nominated = discovered.filter(model => model.featured);
        if (nominated.length > 0) {
            const aliasedToo = discovered.filter(model => !model.featured && aliased.has(`${prefix}/${model.id}`));
            return [...nominated, ...aliasedToo];
        }
        return discovered
            .filter(model => DiscoveredModels.undatedId(model.id) === undefined)
            .map((model, index) => ({ model, index }))
            .sort((left, right) => this.compareFeatured(left, right, prefix, aliased))
            .slice(0, FEATURED_MODEL_COUNT)
            .map(entry => entry.model);
    }

    /** Orders two candidates of the same provider; `index` preserves the reported order as the last resort. */
    protected compareFeatured(
        left: { model: DiscoveredModel; index: number },
        right: { model: DiscoveredModel; index: number },
        prefix: string,
        aliased: ReadonlySet<string>
    ): number {
        const byAlias = Number(aliased.has(`${prefix}/${right.model.id}`)) - Number(aliased.has(`${prefix}/${left.model.id}`));
        if (byAlias !== 0) {
            return byAlias;
        }
        const byRelease = (right.model.released ?? 0) - (left.model.released ?? 0);
        if (byRelease !== 0) {
            return byRelease;
        }
        const byVersion = DiscoveredModels.compareByVersion(left.model.id, right.model.id);
        return byVersion !== 0 ? byVersion : left.index - right.index;
    }

    /** Every model id a built-in or user-edited alias points at, fully qualified. */
    protected getAliasedModelIds(): ReadonlySet<string> {
        const ids = new Set<string>();
        for (const alias of this.aliasRegistry.getAliases()) {
            alias.defaultModelIds.forEach(id => ids.add(id));
            if (alias.selectedModelId) {
                ids.add(alias.selectedModelId);
            }
        }
        return ids;
    }

    /**
     * Drops the marked ids of a provider that a successful discovery no longer offers, so that the
     * list does not accumulate models that no longer exist. Only a live discovery prunes: a cached
     * result, a failure or a missing credential says nothing about what the provider offers.
     */
    protected pruneFavorites(status: ModelDiscoveryStatus): void {
        if (status.state !== 'ready' || status.fromCache || !status.discovered) {
            return;
        }
        const prefix = status.modelIdPrefix ?? status.providerId;
        const offered = new Set(status.discovered.map(model => `${prefix}/${model.id}`));
        const favorites = this.getFavorites();
        const kept = favorites.filter(id => !id.startsWith(`${prefix}/`) || offered.has(id));
        if (kept.length !== favorites.length) {
            this.preferenceService.set(PREFERENCE_NAME_FAVORITE_MODELS, kept, PreferenceScope.User);
        }
    }
}
