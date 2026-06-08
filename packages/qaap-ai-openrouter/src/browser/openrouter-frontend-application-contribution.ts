// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { PreferenceService } from '@theia/core';
import { AICorePreferences, PREFERENCE_NAME_MAX_RETRIES } from '@theia/ai-core/lib/common/ai-core-preferences';
import { OpenAiLanguageModelsManager, OpenAiModelDescription } from '@theia/ai-openai/lib/common';
import { API_KEY_PREF, BASE_URL_PREF, MODELS_PREF, OPENROUTER_DEFAULT_BASE_URL } from './openrouter-preferences';
import { filterOpenRouterModelSlugs, normalizeOpenRouterModelSlug, OPENROUTER_PROVIDER_ID } from '../common/openrouter-models';

/**
 * Registers OpenRouter models as language models. OpenRouter exposes a unified OpenAI-compatible
 * gateway in front of dozens of providers, so the models are routed through the
 * {@link OpenAiLanguageModelsManager} with the OpenRouter endpoint and API key supplied per
 * model. This keeps OpenRouter a first-class provider without duplicating the OpenAI request
 * engine.
 */
@injectable()
export class OpenRouterFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(OpenAiLanguageModelsManager)
    protected manager: OpenAiLanguageModelsManager;

    @inject(AICorePreferences)
    protected aiCorePreferences: AICorePreferences;

    protected prevModels: string[] = [];

    onStart(): void {
        this.preferenceService.ready.then(() => {
            const models = this.normalizeModelIds(this.preferenceService.get<string[]>(MODELS_PREF, []));
            this.manager.createOrUpdateLanguageModels(...models.map(modelId => this.createOpenRouterModelDescription(modelId)));
            this.prevModels = [...models];

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === MODELS_PREF) {
                    this.handleModelChanges(this.normalizeModelIds(this.preferenceService.get<string[]>(MODELS_PREF, [])));
                } else if (event.preferenceName === API_KEY_PREF || event.preferenceName === BASE_URL_PREF) {
                    this.updateAllModels();
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

        this.manager.removeLanguageModels(...modelsToRemove.map(model => `${OPENROUTER_PROVIDER_ID}/${model}`));
        this.manager.createOrUpdateLanguageModels(...modelsToAdd.map(modelId => this.createOpenRouterModelDescription(modelId)));
        this.prevModels = newModels;
    }

    protected updateAllModels(): void {
        const models = this.normalizeModelIds(this.preferenceService.get<string[]>(MODELS_PREF, []));
        this.manager.createOrUpdateLanguageModels(...models.map(modelId => this.createOpenRouterModelDescription(modelId)));
    }

    /**
     * Strip the `openrouter/` prefix from preference entries that already include it. Users frequently
     * copy ids straight from the model dropdown, which renders the full namespaced id (e.g.
     * `openrouter/nvidia/nemotron-3-super-120b-a12b:free`). Without this normalization we'd send the
     * prefixed slug to the OpenRouter API and get `400 ... is not a valid model ID`.
     */
    protected normalizeModelIds(ids: string[]): string[] {
        return filterOpenRouterModelSlugs(ids.map(id => normalizeOpenRouterModelSlug(id)));
    }

    protected createOpenRouterModelDescription(modelId: string): OpenAiModelDescription {
        const apiKey = this.preferenceService.get<string>(API_KEY_PREF, undefined);
        const baseUrl = this.preferenceService.get<string>(BASE_URL_PREF, OPENROUTER_DEFAULT_BASE_URL) || OPENROUTER_DEFAULT_BASE_URL;
        const maxRetries = this.aiCorePreferences.get(PREFERENCE_NAME_MAX_RETRIES) ?? 3;
        return {
            id: `${OPENROUTER_PROVIDER_ID}/${modelId}`,
            model: modelId,
            url: baseUrl,
            apiKey: apiKey && apiKey.trim() ? apiKey.trim() : undefined,
            apiVersion: undefined,
            // OpenRouter normalizes the system role for routes that prefer 'system'; using 'system'
            // works across the widest range of upstream providers.
            developerMessageSettings: 'system',
            enableStreaming: true,
            // Structured output (`response_format: json_schema`) coverage varies across the upstream
            // models OpenRouter fronts. Leaving this off avoids errors on routes that don't support it;
            // function calling itself is unaffected and works on most modern models.
            supportsStructuredOutput: false,
            maxRetries: maxRetries,
            useResponseApi: false
        };
    }
}
