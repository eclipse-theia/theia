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
import { OpenAiLanguageModelsManager, OpenAiModelDescription } from '../common';
import { API_KEY_PREF, CUSTOM_ENDPOINTS_PREF, MODELS_PREF } from './openai-preferences';
import { PREFERENCE_NAME_REQUEST_SETTINGS, RequestSetting } from '@theia/ai-core/lib/browser/ai-core-preferences';

const OPENAI_PROVIDER_ID = 'openai';

@injectable()
export class OpenAiFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(OpenAiLanguageModelsManager)
    protected manager: OpenAiLanguageModelsManager;

    protected prevModels: string[] = [];
    protected prevCustomModels: Partial<OpenAiModelDescription>[] = [];

    onStart(): void {
        this.preferenceService.ready.then(() => {
            const apiKey = this.preferenceService.get<string>(API_KEY_PREF, undefined);
            this.manager.setApiKey(apiKey);

            const models = this.preferenceService.get<string[]>(MODELS_PREF, []);
            const requestSettings = this.getRequestSettingsPref();
            this.manager.createOrUpdateLanguageModels(...models.map(modelId => this.createOpenAIModelDescription(modelId, requestSettings)));
            this.prevModels = [...models];

            const customModels = this.preferenceService.get<Partial<OpenAiModelDescription>[]>(CUSTOM_ENDPOINTS_PREF, []);
            this.manager.createOrUpdateLanguageModels(...this.createCustomModelDescriptionsFromPreferences(customModels, this.getRequestSettingsPref()));
            this.prevCustomModels = [...customModels];

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === API_KEY_PREF) {
                    this.manager.setApiKey(event.newValue);
                } else if (event.preferenceName === MODELS_PREF) {
                    this.handleModelChanges(event.newValue as string[]);
                } else if (event.preferenceName === CUSTOM_ENDPOINTS_PREF) {
                    this.handleCustomModelChanges(event.newValue as Partial<OpenAiModelDescription>[]);
                } else if (event.preferenceName === PREFERENCE_NAME_REQUEST_SETTINGS) {
                    this.handleRequestSettingsChanges(event.newValue as RequestSetting[]);
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
        const requestSettings = this.getRequestSettingsPref();
        this.manager.createOrUpdateLanguageModels(...modelsToAdd.map(modelId => this.createOpenAIModelDescription(modelId, requestSettings)));
        this.prevModels = newModels;
    }

    private getRequestSettingsPref(): RequestSetting[] {
        return this.preferenceService.get<RequestSetting[]>(PREFERENCE_NAME_REQUEST_SETTINGS, []);
    }

    protected handleCustomModelChanges(newCustomModels: Partial<OpenAiModelDescription>[]): void {
        const requestSettings = this.getRequestSettingsPref();
        const oldModels = this.createCustomModelDescriptionsFromPreferences(this.prevCustomModels, requestSettings);
        const newModels = this.createCustomModelDescriptionsFromPreferences(newCustomModels, requestSettings);

        const modelsToRemove = oldModels.filter(model => !newModels.some(newModel => newModel.id === model.id));
        const modelsToAddOrUpdate = newModels.filter(newModel =>
            !oldModels.some(model =>
                model.id === newModel.id &&
                model.model === newModel.model &&
                model.url === newModel.url &&
                model.apiKey === newModel.apiKey &&
                model.enableStreaming === newModel.enableStreaming));

        this.manager.removeLanguageModels(...modelsToRemove.map(model => model.id));
        this.manager.createOrUpdateLanguageModels(...modelsToAddOrUpdate);
        this.prevCustomModels = [...newCustomModels];
    }

    protected handleRequestSettingsChanges(newSettings: RequestSetting[]): void {
        const models = this.preferenceService.get<string[]>(MODELS_PREF, []);
        this.manager.createOrUpdateLanguageModels(...models.map(modelId => this.createOpenAIModelDescription(modelId, newSettings)));

        const customModels = this.preferenceService.get<Partial<OpenAiModelDescription>[]>(CUSTOM_ENDPOINTS_PREF, []);
        this.manager.createOrUpdateLanguageModels(...this.createCustomModelDescriptionsFromPreferences(customModels, newSettings));
    }

    protected createOpenAIModelDescription(modelId: string, requestSettings: RequestSetting[]): OpenAiModelDescription {
        const id = `${OPENAI_PROVIDER_ID}/${modelId}`;
        const modelRequestSetting = this.getMatchingRequestSetting(modelId, OPENAI_PROVIDER_ID, requestSettings);
        return {
            id: id,
            model: modelId,
            apiKey: true,
            enableStreaming: !openAIModelsWithDisabledStreaming.includes(modelId),
            defaultRequestSettings: modelRequestSetting?.requestSettings
        };
    }

    protected createCustomModelDescriptionsFromPreferences(
        preferences: Partial<OpenAiModelDescription>[],
        requestSettings: RequestSetting[]
    ): OpenAiModelDescription[] {
        return preferences.reduce((acc, pref) => {
            if (!pref.model || !pref.url || typeof pref.model !== 'string' || typeof pref.url !== 'string') {
                return acc;
            }

            const modelRequestSetting = this.getMatchingRequestSetting(pref.model, OPENAI_PROVIDER_ID, requestSettings);

            return [
                ...acc,
                {
                    id: pref.id && typeof pref.id === 'string' ? pref.id : pref.model,
                    model: pref.model,
                    url: pref.url,
                    apiKey: typeof pref.apiKey === 'string' || pref.apiKey === true ? pref.apiKey : undefined,
                    enableStreaming: pref.enableStreaming ?? true,
                    defaultRequestSettings: modelRequestSetting?.requestSettings
                }
            ];
        }, []);
    }
    protected getMatchingRequestSetting(
        modelId: string,
        providerId: string,
        requestSettings: RequestSetting[]
    ): RequestSetting | undefined {
        const matchingSettings = requestSettings.filter(
            setting => (!setting.providerId || setting.providerId === providerId) && setting.modelId === modelId
        );
        if (matchingSettings.length > 1) {
            console.warn(
                `Multiple entries found for provider "${providerId}" and model "${modelId}". Using the first match.`
            );
        }
        return matchingSettings[0];
    }
}

const openAIModelsWithDisabledStreaming = ['o1-preview'];
