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

import { FrontendApplicationContribution, PreferenceService, PreferenceChange } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { VercelAiLanguageModelsManager, VercelAiModelDescription, VercelAiProvider } from '../common';
import { ANTHROPIC_API_KEY_PREF, CUSTOM_ENDPOINTS_PREF, MODELS_PREF, OPENAI_API_KEY_PREF, VERCEL_AI_PROVIDER_ID } from './vercel-ai-preferences';
import { AICorePreferences, PREFERENCE_NAME_MAX_RETRIES } from '@theia/ai-core/lib/browser/ai-core-preferences';

interface ModelConfig {
    id: string;
    model: string;
    provider: VercelAiProvider;
}

@injectable()
export class VercelAiFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(VercelAiLanguageModelsManager)
    protected manager: VercelAiLanguageModelsManager;

    @inject(AICorePreferences)
    protected aiCorePreferences: AICorePreferences;

    onStart(): void {
        this.preferenceService.ready.then(() => {
            // Set up provider-specific API keys
            const openaiApiKey = this.preferenceService.get<string>(OPENAI_API_KEY_PREF, undefined);
            const anthropicApiKey = this.preferenceService.get<string>(ANTHROPIC_API_KEY_PREF, undefined);

            // Set provider configs
            if (openaiApiKey) {
                this.manager.setProviderConfig('openai', { provider: 'openai', apiKey: openaiApiKey });
            }

            if (anthropicApiKey) {
                this.manager.setProviderConfig('anthropic', { provider: 'anthropic', apiKey: anthropicApiKey });
            }

            // Initial setup of models
            const models = this.preferenceService.get<ModelConfig[]>(MODELS_PREF, []);
            this.manager.createOrUpdateLanguageModels(...models.map(model => this.createVercelAiModelDescription(model)));

            const customModels = this.preferenceService.get<Partial<VercelAiModelDescription>[]>(CUSTOM_ENDPOINTS_PREF, []);
            this.manager.createOrUpdateLanguageModels(...this.createCustomModelDescriptionsFromPreferences(customModels));

            // Set up listeners for preference changes
            this.preferenceService.onPreferenceChanged(this.handlePreferenceChange.bind(this));

            this.aiCorePreferences.onPreferenceChanged(event => {
                if (event.preferenceName === PREFERENCE_NAME_MAX_RETRIES) {
                    this.updateAllModelsWithNewRetries();
                }
            });
        });
    }

    protected handlePreferenceChange(event: PreferenceChange): void {
        switch (event.preferenceName) {
            case OPENAI_API_KEY_PREF:
                this.manager.setProviderConfig('openai', { provider: 'openai', apiKey: event.newValue });
                break;
            case ANTHROPIC_API_KEY_PREF:
                this.manager.setProviderConfig('anthropic', { provider: 'anthropic', apiKey: event.newValue });
                break;
            case MODELS_PREF:
                this.handleModelChanges(event);
                break;
            case CUSTOM_ENDPOINTS_PREF:
                this.handleCustomModelChanges(event);
                break;
        }
    }

    protected handleModelChanges(event: PreferenceChange): void {
        const newModels = this.ensureModelConfigArray(event.newValue);
        const oldModels = this.ensureModelConfigArray(event.oldValue);

        const oldModelIds = new Set(oldModels.map(m => m.id));
        const newModelIds = new Set(newModels.map(m => m.id));

        const modelsToRemove = [...oldModelIds].filter(modelId => !newModelIds.has(modelId));
        const modelsToAdd = newModels.filter(model => !oldModelIds.has(model.id));

        this.manager.removeLanguageModels(...modelsToRemove);
        this.manager.createOrUpdateLanguageModels(...modelsToAdd.map(model => this.createVercelAiModelDescription(model)));
    }

    protected handleCustomModelChanges(event: PreferenceChange): void {
        const newCustomModels = this.ensureCustomModelArray(event.newValue);
        const oldCustomModels = this.ensureCustomModelArray(event.oldValue);

        const oldModels = this.createCustomModelDescriptionsFromPreferences(oldCustomModels);
        const newModels = this.createCustomModelDescriptionsFromPreferences(newCustomModels);

        const modelsToRemove = oldModels.filter(model => !newModels.some(newModel => newModel.id === model.id));
        const modelsToAddOrUpdate = newModels.filter(newModel =>
            !oldModels.some(model =>
                model.id === newModel.id &&
                model.model === newModel.model &&
                model.url === newModel.url &&
                model.apiKey === newModel.apiKey &&
                model.supportsStructuredOutput === newModel.supportsStructuredOutput &&
                model.enableStreaming === newModel.enableStreaming &&
                model.provider === newModel.provider));

        this.manager.removeLanguageModels(...modelsToRemove.map(model => model.id));
        this.manager.createOrUpdateLanguageModels(...modelsToAddOrUpdate);
    }

    protected ensureModelConfigArray(value: unknown): ModelConfig[] {
        if (!value || !Array.isArray(value)) {
            return [];
        }

        return value.filter(item =>
            item &&
            typeof item === 'object' &&
            'id' in item &&
            'model' in item &&
            'provider' in item &&
            typeof item.id === 'string' &&
            typeof item.model === 'string' &&
            (typeof item.provider === 'string' || item.provider === undefined)
        ) as ModelConfig[];
    }

    protected ensureCustomModelArray(value: unknown): Partial<VercelAiModelDescription>[] {
        if (!value || !Array.isArray(value)) {
            return [];
        }

        return value.filter(item =>
            item &&
            typeof item === 'object'
        ) as Partial<VercelAiModelDescription>[];
    }

    protected updateAllModelsWithNewRetries(): void {
        const models = this.preferenceService.get<ModelConfig[]>(MODELS_PREF, []);
        this.manager.createOrUpdateLanguageModels(...models.map(model => this.createVercelAiModelDescription(model)));

        const customModels = this.preferenceService.get<Partial<VercelAiModelDescription>[]>(CUSTOM_ENDPOINTS_PREF, []);
        this.manager.createOrUpdateLanguageModels(...this.createCustomModelDescriptionsFromPreferences(customModels));
    }

    protected createVercelAiModelDescription(modelInfo: ModelConfig): VercelAiModelDescription {
        const maxRetries = this.aiCorePreferences.get(PREFERENCE_NAME_MAX_RETRIES) ?? 3;
        // The model ID already includes the 'vercel' prefix from preferences
        return {
            id: modelInfo.id,
            model: modelInfo.model,
            provider: modelInfo.provider,
            apiKey: true,
            enableStreaming: true,
            supportsStructuredOutput: modelsSupportingStructuredOutput.includes(modelInfo.model),
            maxRetries: maxRetries
        };
    }

    protected createCustomModelDescriptionsFromPreferences(
        preferences: Partial<VercelAiModelDescription>[]
    ): VercelAiModelDescription[] {
        const maxRetries = this.aiCorePreferences.get(PREFERENCE_NAME_MAX_RETRIES) ?? 3;
        return preferences.reduce((acc, pref) => {
            if (!pref.model || !pref.url || typeof pref.model !== 'string' || typeof pref.url !== 'string') {
                return acc;
            }

            // Ensure custom model IDs have the 'vercel' prefix
            const modelId = pref.id && typeof pref.id === 'string' ? pref.id : pref.model;
            const prefixedId = modelId.startsWith('vercel/') ? modelId : `${VERCEL_AI_PROVIDER_ID}/${modelId}`;

            return [
                ...acc,
                {
                    id: prefixedId,
                    model: pref.model,
                    url: pref.url,
                    provider: pref.provider || 'openai',
                    apiKey: typeof pref.apiKey === 'string' || pref.apiKey === true ? pref.apiKey : undefined,
                    supportsStructuredOutput: pref.supportsStructuredOutput ?? true,
                    enableStreaming: pref.enableStreaming ?? true,
                    maxRetries: pref.maxRetries ?? maxRetries
                }
            ];
        }, []);
    }
}

// List of models that support structured output via JSON schema
const modelsSupportingStructuredOutput = [
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229'
];
