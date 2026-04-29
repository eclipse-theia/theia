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

import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ReasoningApi, ReasoningSupport } from '@theia/ai-core';
import { AnthropicLanguageModelsManager, AnthropicModelDescription } from '../common';
import { API_KEY_PREF, CUSTOM_ENDPOINTS_PREF, MODELS_PREF } from '../common/anthropic-preferences';
import { AICorePreferences, PREFERENCE_NAME_MAX_RETRIES } from '@theia/ai-core/lib/common/ai-core-preferences';
import { PreferenceService } from '@theia/core';

const ANTHROPIC_PROVIDER_ID = 'anthropic';

// Model-specific maxTokens values
const DEFAULT_MODEL_MAX_TOKENS: Record<string, number> = {
    'claude-3-opus-latest': 4096,
    'claude-3-5-haiku-latest': 8192,
    'claude-3-5-sonnet-latest': 8192,
    'claude-3-7-sonnet-latest': 64000,
    'claude-opus-4-20250514': 32000,
    'claude-sonnet-4-20250514': 64000,
    'claude-sonnet-4-5': 64000,
    'claude-sonnet-4-6': 64000,
    'claude-sonnet-4-0': 64000,
    'claude-opus-4-5': 64000,
    'claude-opus-4-6': 128000,
    'claude-opus-4-7': 128000,
    'claude-opus-4-1': 32000
};

/** Claude 4.6+ (Opus/Sonnet/Haiku) use the adaptive thinking API. */
const EFFORT_REASONING = /^claude-(?:opus|sonnet|haiku)-4-[6-9]/i;
/** Claude 4.0–4.5 (including dated snapshots) use legacy extended thinking. */
const BUDGET_REASONING = /^claude-(?:opus|sonnet|haiku)-4-(?:[0-5](?:-|$)|\d{4})/i;
/** Models that accept the `xhigh` effort value. */
const XHIGH_EFFORT = /^claude-opus-4-7(?:-|$)/i;

const ANTHROPIC_REASONING_SUPPORT: ReasoningSupport = {
    supportedLevels: ['off', 'minimal', 'low', 'medium', 'high', 'auto'],
    defaultLevel: 'auto'
};

function reasoningApiFor(modelId: string): ReasoningApi | undefined {
    if (EFFORT_REASONING.test(modelId)) {
        return 'effort';
    }
    if (BUDGET_REASONING.test(modelId)) {
        return 'budget';
    }
    return undefined;
}

@injectable()
export class AnthropicFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(AnthropicLanguageModelsManager)
    protected manager: AnthropicLanguageModelsManager;

    @inject(AICorePreferences)
    protected aiCorePreferences: AICorePreferences;

    protected prevModels: string[] = [];
    protected prevCustomModels: Partial<AnthropicModelDescription>[] = [];

    onStart(): void {
        this.preferenceService.ready.then(() => {
            const apiKey = this.preferenceService.get<string>(API_KEY_PREF, undefined);
            this.manager.setApiKey(apiKey);

            const proxyUri = this.preferenceService.get<string>('http.proxy', undefined);
            this.manager.setProxyUrl(proxyUri);

            const models = this.preferenceService.get<string[]>(MODELS_PREF, []);
            this.manager.createOrUpdateLanguageModels(...models.map(modelId => this.createAnthropicModelDescription(modelId)));
            this.prevModels = [...models];

            const customModels = this.preferenceService.get<Partial<AnthropicModelDescription>[]>(CUSTOM_ENDPOINTS_PREF, []);
            this.manager.createOrUpdateLanguageModels(...this.createCustomModelDescriptionsFromPreferences(customModels));
            this.prevCustomModels = [...customModels];

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === API_KEY_PREF) {
                    this.manager.setApiKey(this.preferenceService.get<string>(API_KEY_PREF, undefined));
                    this.updateAllModels();
                } else if (event.preferenceName === MODELS_PREF) {
                    this.handleModelChanges(this.preferenceService.get<string[]>(MODELS_PREF, []));
                } else if (event.preferenceName === 'http.proxy') {
                    this.manager.setProxyUrl(this.preferenceService.get<string>('http.proxy', undefined));
                    this.updateAllModels();
                } else if (event.preferenceName === CUSTOM_ENDPOINTS_PREF) {
                    this.handleCustomModelChanges(this.preferenceService.get<Partial<AnthropicModelDescription>[]>(CUSTOM_ENDPOINTS_PREF, []));
                }
            });

            this.aiCorePreferences.onPreferenceChanged(event => {
                if (event.preferenceName === PREFERENCE_NAME_MAX_RETRIES) {
                    this.updateAllModels();
                }
            });
        });
    }

    protected handleModelChanges(newModels: string[]): void {
        const oldModels = new Set(this.prevModels);
        const updatedModels = new Set(newModels);

        const modelsToRemove = [...oldModels].filter(model => !updatedModels.has(model));
        const modelsToAdd = [...updatedModels].filter(model => !oldModels.has(model));

        this.manager.removeLanguageModels(...modelsToRemove.map(model => `${ANTHROPIC_PROVIDER_ID}/${model}`));
        this.manager.createOrUpdateLanguageModels(...modelsToAdd.map(modelId => this.createAnthropicModelDescription(modelId)));
        this.prevModels = newModels;
    }

    protected handleCustomModelChanges(newCustomModels: Partial<AnthropicModelDescription>[]): void {
        const oldModels = this.createCustomModelDescriptionsFromPreferences(this.prevCustomModels);
        const newModels = this.createCustomModelDescriptionsFromPreferences(newCustomModels);

        const modelsToRemove = oldModels.filter(model => !newModels.some(newModel => newModel.id === model.id));
        const modelsToAddOrUpdate = newModels.filter(newModel =>
            !oldModels.some(model =>
                model.id === newModel.id &&
                model.model === newModel.model &&
                model.url === newModel.url &&
                model.apiKey === newModel.apiKey &&
                model.maxRetries === newModel.maxRetries &&
                model.useCaching === newModel.useCaching &&
                model.enableStreaming === newModel.enableStreaming &&
                model.reasoningApi === newModel.reasoningApi &&
                model.supportsXHighEffort === newModel.supportsXHighEffort));

        this.manager.removeLanguageModels(...modelsToRemove.map(model => model.id));
        this.manager.createOrUpdateLanguageModels(...modelsToAddOrUpdate);
        this.prevCustomModels = [...newCustomModels];
    }

    protected updateAllModels(): void {
        const models = this.preferenceService.get<string[]>(MODELS_PREF, []);
        this.manager.createOrUpdateLanguageModels(...models.map(modelId => this.createAnthropicModelDescription(modelId)));

        const customModels = this.preferenceService.get<Partial<AnthropicModelDescription>[]>(CUSTOM_ENDPOINTS_PREF, []);
        this.manager.createOrUpdateLanguageModels(...this.createCustomModelDescriptionsFromPreferences(customModels));
    }

    protected createAnthropicModelDescription(modelId: string): AnthropicModelDescription {
        const id = `${ANTHROPIC_PROVIDER_ID}/${modelId}`;
        const maxTokens = DEFAULT_MODEL_MAX_TOKENS[modelId];
        const maxRetries = this.aiCorePreferences.get(PREFERENCE_NAME_MAX_RETRIES) ?? 3;
        const reasoningApi = reasoningApiFor(modelId);

        const description: AnthropicModelDescription = {
            id: id,
            model: modelId,
            apiKey: true,
            enableStreaming: true,
            useCaching: true,
            maxRetries: maxRetries,
            reasoningSupport: reasoningApi ? ANTHROPIC_REASONING_SUPPORT : undefined,
            reasoningApi,
            supportsXHighEffort: XHIGH_EFFORT.test(modelId)
        };

        if (maxTokens !== undefined) {
            description.maxTokens = maxTokens;
        } else {
            description.maxTokens = 64000;
        }

        return description;
    }

    protected createCustomModelDescriptionsFromPreferences(preferences: Partial<AnthropicModelDescription>[]): AnthropicModelDescription[] {
        const maxRetries = this.aiCorePreferences.get(PREFERENCE_NAME_MAX_RETRIES) ?? 3;
        return preferences.reduce((acc, pref) => {
            if (!pref.model || !pref.url || typeof pref.model !== 'string' || typeof pref.url !== 'string') {
                return acc;
            }
            // Default to the model-name heuristic so reasoning-capable Claude models exposed via a
            // custom endpoint still get the selector. Users can override via the `reasoningApi` field
            // (set to `null` to disable, or to `'effort'` / `'budget'` to force a specific shape).
            const reasoningApi: typeof pref.reasoningApi = 'reasoningApi' in pref
                ? (pref.reasoningApi === 'effort' || pref.reasoningApi === 'budget' ? pref.reasoningApi : undefined)
                : reasoningApiFor(pref.model);
            const supportsXHighEffort = typeof pref.supportsXHighEffort === 'boolean' ? pref.supportsXHighEffort : XHIGH_EFFORT.test(pref.model);
            return [
                ...acc,
                {
                    id: pref.id && typeof pref.id === 'string' ? pref.id : pref.model,
                    model: pref.model,
                    url: pref.url,
                    apiKey: typeof pref.apiKey === 'string' || pref.apiKey === true ? pref.apiKey : undefined,
                    enableStreaming: pref.enableStreaming ?? true,
                    useCaching: pref.useCaching ?? true,
                    maxRetries: pref.maxRetries ?? maxRetries,
                    reasoningSupport: reasoningApi ? ANTHROPIC_REASONING_SUPPORT : undefined,
                    reasoningApi,
                    supportsXHighEffort
                }
            ];
        }, []);
    }

}
