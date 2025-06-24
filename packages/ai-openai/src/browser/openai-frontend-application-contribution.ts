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

import { FrontendApplicationContribution, PreferenceService } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { OpenAiLanguageModelsManager, OpenAiModelDescription, OPENAI_PROVIDER_ID } from '../common';
import { API_KEY_PREF, CUSTOM_ENDPOINTS_PREF, MODELS_PREF } from './openai-preferences';
import { AICorePreferences, PREFERENCE_NAME_MAX_RETRIES } from '@theia/ai-core/lib/browser/ai-core-preferences';

@injectable()
export class OpenAiFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(OpenAiLanguageModelsManager)
    protected manager: OpenAiLanguageModelsManager;

    @inject(AICorePreferences)
    protected aiCorePreferences: AICorePreferences;

    protected prevModels: string[] = [];
    protected prevCustomModels: Partial<OpenAiModelDescription>[] = [];

    onStart(): void {
        this.preferenceService.ready.then(() => {
            const apiKey = this.preferenceService.get<string>(API_KEY_PREF, undefined);
            this.manager.setApiKey(apiKey);

            const models = this.preferenceService.get<string[]>(MODELS_PREF, []);
            this.manager.createOrUpdateLanguageModels(...models.map(modelId => this.createOpenAIModelDescription(modelId)));
            this.prevModels = [...models];

            const customModels = this.preferenceService.get<Partial<OpenAiModelDescription>[]>(CUSTOM_ENDPOINTS_PREF, []);
            this.manager.createOrUpdateLanguageModels(...this.createCustomModelDescriptionsFromPreferences(customModels));
            this.prevCustomModels = [...customModels];

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === API_KEY_PREF) {
                    this.manager.setApiKey(event.newValue);
                } else if (event.preferenceName === MODELS_PREF) {
                    this.handleModelChanges(event.newValue as string[]);
                } else if (event.preferenceName === CUSTOM_ENDPOINTS_PREF) {
                    this.handleCustomModelChanges(event.newValue as Partial<OpenAiModelDescription>[]);
                }
            });

            this.aiCorePreferences.onPreferenceChanged(event => {
                if (event.preferenceName === PREFERENCE_NAME_MAX_RETRIES) {
                    this.updateAllModelsWithNewRetries();
                }
            });
        });
    }

    protected handleModelChanges(newModels: string[]): void {
        const oldModels = new Set(this.prevModels);
        const updatedModels = new Set(newModels);

        const modelsToRemove = [...oldModels].filter(model => !updatedModels.has(model));
        const modelsToAdd = [...updatedModels].filter(model => !oldModels.has(model));

        this.manager.removeLanguageModels(...modelsToRemove.map(model => `openai/${model}`));
        this.manager.createOrUpdateLanguageModels(...modelsToAdd.map(modelId => this.createOpenAIModelDescription(modelId)));
        this.prevModels = newModels;
    }

    protected handleCustomModelChanges(newCustomModels: Partial<OpenAiModelDescription>[]): void {
        const oldModels = this.createCustomModelDescriptionsFromPreferences(this.prevCustomModels);
        const newModels = this.createCustomModelDescriptionsFromPreferences(newCustomModels);

        const modelsToRemove = oldModels.filter(model => !newModels.some(newModel => newModel.id === model.id));
        const modelsToAddOrUpdate = newModels.filter(newModel =>
            !oldModels.some(model =>
                model.id === newModel.id &&
                model.model === newModel.model &&
                model.url === newModel.url &&
                model.apiKey === newModel.apiKey &&
                model.apiVersion === newModel.apiVersion &&
                model.developerMessageSettings === newModel.developerMessageSettings &&
                model.supportsStructuredOutput === newModel.supportsStructuredOutput &&
                model.enableStreaming === newModel.enableStreaming));

        this.manager.removeLanguageModels(...modelsToRemove.map(model => model.id));
        this.manager.createOrUpdateLanguageModels(...modelsToAddOrUpdate);
        this.prevCustomModels = [...newCustomModels];
    }

    protected updateAllModelsWithNewRetries(): void {
        const models = this.preferenceService.get<string[]>(MODELS_PREF, []);
        this.manager.createOrUpdateLanguageModels(...models.map(modelId => this.createOpenAIModelDescription(modelId)));

        const customModels = this.preferenceService.get<Partial<OpenAiModelDescription>[]>(CUSTOM_ENDPOINTS_PREF, []);
        this.manager.createOrUpdateLanguageModels(...this.createCustomModelDescriptionsFromPreferences(customModels));
    }

    protected createOpenAIModelDescription(modelId: string): OpenAiModelDescription {
        const id = `${OPENAI_PROVIDER_ID}/${modelId}`;
        const maxRetries = this.aiCorePreferences.get(PREFERENCE_NAME_MAX_RETRIES) ?? 3;
        return {
            id: id,
            model: modelId,
            apiKey: true,
            apiVersion: true,
            developerMessageSettings: openAIModelsNotSupportingDeveloperMessages.includes(modelId) ? 'user' : 'developer',
            enableStreaming: !openAIModelsWithDisabledStreaming.includes(modelId),
            supportsStructuredOutput: !openAIModelsWithoutStructuredOutput.includes(modelId),
            maxRetries: maxRetries
        };
    }

    protected createCustomModelDescriptionsFromPreferences(
        preferences: Partial<OpenAiModelDescription>[]
    ): OpenAiModelDescription[] {
        const maxRetries = this.aiCorePreferences.get(PREFERENCE_NAME_MAX_RETRIES) ?? 3;
        return preferences.reduce((acc, pref) => {
            if (!pref.model || !pref.url || typeof pref.model !== 'string' || typeof pref.url !== 'string') {
                return acc;
            }

            return [
                ...acc,
                {
                    id: pref.id && typeof pref.id === 'string' ? pref.id : pref.model,
                    model: pref.model,
                    url: pref.url,
                    apiKey: typeof pref.apiKey === 'string' || pref.apiKey === true ? pref.apiKey : undefined,
                    apiVersion: typeof pref.apiVersion === 'string' || pref.apiVersion === true ? pref.apiVersion : undefined,
                    developerMessageSettings: pref.developerMessageSettings ?? 'developer',
                    supportsStructuredOutput: pref.supportsStructuredOutput ?? true,
                    enableStreaming: pref.enableStreaming ?? true,
                    maxRetries: pref.maxRetries ?? maxRetries
                }
            ];
        }, []);
    }
}

const openAIModelsWithDisabledStreaming: string[] = [];
const openAIModelsNotSupportingDeveloperMessages = ['o1-preview', 'o1-mini'];
const openAIModelsWithoutStructuredOutput = ['o1-preview', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1-mini', 'gpt-4o-2024-05-13'];
