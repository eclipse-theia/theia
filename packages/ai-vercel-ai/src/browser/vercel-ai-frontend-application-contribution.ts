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

import { FrontendApplicationContribution, PreferenceService } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { VercelAiLanguageModelsManager, VercelAiModelDescription, VercelAiProvider } from '../common';
import { ANTHROPIC_API_KEY_PREF, CUSTOM_ENDPOINTS_PREF, MODELS_PREF, OPENAI_API_KEY_PREF, VERCEL_AI_PROVIDER_ID } from './vercel-ai-preferences';

@injectable()
export class VercelAiFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(VercelAiLanguageModelsManager)
    protected manager: VercelAiLanguageModelsManager;

    protected prevModels: Array<{ id: string, model: string, provider: VercelAiProvider }> = [];
    protected prevCustomModels: Partial<VercelAiModelDescription>[] = [];

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

            // Set up models
            const models = this.preferenceService.get<Array<{ id: string, model: string, provider: VercelAiProvider }>>(MODELS_PREF, []);
            console.log('Registering default models:', models);
            this.manager.createOrUpdateLanguageModels(...models.map(model => this.createVercelAiModelDescription(model)));
            this.prevModels = [...models];

            const customModels = this.preferenceService.get<Partial<VercelAiModelDescription>[]>(CUSTOM_ENDPOINTS_PREF, []);
            this.manager.createOrUpdateLanguageModels(...this.createCustomModelDescriptionsFromPreferences(customModels));
            this.prevCustomModels = [...customModels];

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === OPENAI_API_KEY_PREF) {
                    this.manager.setProviderConfig('openai', { provider: 'openai', apiKey: event.newValue });
                } else if (event.preferenceName === ANTHROPIC_API_KEY_PREF) {
                    this.manager.setProviderConfig('anthropic', { provider: 'anthropic', apiKey: event.newValue });
                } else if (event.preferenceName === MODELS_PREF) {
                    this.handleModelChanges(event.newValue as Array<{ id: string, model: string, provider: VercelAiProvider }>);
                } else if (event.preferenceName === CUSTOM_ENDPOINTS_PREF) {
                    this.handleCustomModelChanges(event.newValue as Partial<VercelAiModelDescription>[]);
                }
            });
        });
    }

    protected handleModelChanges(newModels: Array<{ id: string, model: string, provider: VercelAiProvider }>): void {
        const oldModels = new Set(this.prevModels.map(m => m.id));
        const updatedModels = new Set(newModels.map(m => m.id));

        const modelsToRemove = [...oldModels].filter(modelId => !updatedModels.has(modelId));
        const modelsToAdd = newModels.filter(model => !oldModels.has(model.id));

        this.manager.removeLanguageModels(...modelsToRemove);
        this.manager.createOrUpdateLanguageModels(...modelsToAdd.map(model => this.createVercelAiModelDescription(model)));
        this.prevModels = newModels;
    }

    protected handleCustomModelChanges(newCustomModels: Partial<VercelAiModelDescription>[]): void {
        const oldModels = this.createCustomModelDescriptionsFromPreferences(this.prevCustomModels);
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
        this.prevCustomModels = [...newCustomModels];
    }

    protected createVercelAiModelDescription(modelInfo: { id: string, model: string, provider: VercelAiProvider }): VercelAiModelDescription {
        // The model ID already includes the 'vercel' prefix from preferences
        return {
            id: modelInfo.id,
            model: modelInfo.model,
            provider: modelInfo.provider,
            apiKey: true,
            enableStreaming: true,
            supportsStructuredOutput: modelsSupportingStructuredOutput.includes(modelInfo.model)
        };
    }

    protected createCustomModelDescriptionsFromPreferences(
        preferences: Partial<VercelAiModelDescription>[]
    ): VercelAiModelDescription[] {
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
                    enableStreaming: pref.enableStreaming ?? true
                }
            ];
        }, []);
    }
}

// List of models that support structured output via JSON schema
const modelsSupportingStructuredOutput = [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4o-2024-11-20',
];
