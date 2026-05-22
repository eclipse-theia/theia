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
import { API_KEY_PREF, BASE_URL_PREF, MODELS_PREF, NVIDIA_DEFAULT_BASE_URL } from './nvidia-preferences';

export const NVIDIA_PROVIDER_ID = 'nvidia';

/**
 * Registers NVIDIA NIM models as language models. NVIDIA NIM is OpenAI Chat-Completions compatible,
 * so the models are routed through the {@link OpenAiLanguageModelsManager} with the NVIDIA endpoint
 * and API key supplied per model. This keeps NVIDIA a first-class provider without duplicating the
 * OpenAI request engine.
 */
@injectable()
export class NvidiaFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(OpenAiLanguageModelsManager)
    protected manager: OpenAiLanguageModelsManager;

    @inject(AICorePreferences)
    protected aiCorePreferences: AICorePreferences;

    protected prevModels: string[] = [];

    onStart(): void {
        this.preferenceService.ready.then(() => {
            const models = this.preferenceService.get<string[]>(MODELS_PREF, []);
            this.manager.createOrUpdateLanguageModels(...models.map(modelId => this.createNvidiaModelDescription(modelId)));
            this.prevModels = [...models];

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === MODELS_PREF) {
                    this.handleModelChanges(this.preferenceService.get<string[]>(MODELS_PREF, []));
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

        this.manager.removeLanguageModels(...modelsToRemove.map(model => `${NVIDIA_PROVIDER_ID}/${model}`));
        this.manager.createOrUpdateLanguageModels(...modelsToAdd.map(modelId => this.createNvidiaModelDescription(modelId)));
        this.prevModels = newModels;
    }

    protected updateAllModels(): void {
        const models = this.preferenceService.get<string[]>(MODELS_PREF, []);
        this.manager.createOrUpdateLanguageModels(...models.map(modelId => this.createNvidiaModelDescription(modelId)));
    }

    protected createNvidiaModelDescription(modelId: string): OpenAiModelDescription {
        const apiKey = this.preferenceService.get<string>(API_KEY_PREF, undefined);
        const baseUrl = this.preferenceService.get<string>(BASE_URL_PREF, NVIDIA_DEFAULT_BASE_URL) || NVIDIA_DEFAULT_BASE_URL;
        const maxRetries = this.aiCorePreferences.get(PREFERENCE_NAME_MAX_RETRIES) ?? 3;
        return {
            id: `${NVIDIA_PROVIDER_ID}/${modelId}`,
            model: modelId,
            url: baseUrl,
            apiKey: apiKey && apiKey.trim() ? apiKey.trim() : undefined,
            apiVersion: undefined,
            developerMessageSettings: 'system',
            enableStreaming: true,
            supportsStructuredOutput: true,
            maxRetries: maxRetries,
            useResponseApi: false
        };
    }
}
