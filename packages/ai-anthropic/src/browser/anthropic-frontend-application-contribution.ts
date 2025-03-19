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
import { AnthropicLanguageModelsManager, AnthropicModelDescription } from '../common';
import { API_KEY_PREF, MODELS_PREF } from './anthropic-preferences';
import { PREFERENCE_NAME_REQUEST_SETTINGS, RequestSetting } from '@theia/ai-core/lib/browser/ai-core-preferences';

const ANTHROPIC_PROVIDER_ID = 'anthropic';

// Model-specific maxTokens values
const DEFAULT_MODEL_MAX_TOKENS: Record<string, number> = {
    'claude-3-opus-latest': 4096,
    'claude-3-5-haiku-latest': 8192,
    'claude-3-5-sonnet-latest': 8192,
    'claude-3-7-sonnet-latest': 64000
};

@injectable()
export class AnthropicFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(AnthropicLanguageModelsManager)
    protected manager: AnthropicLanguageModelsManager;

    protected prevModels: string[] = [];

    onStart(): void {
        this.preferenceService.ready.then(() => {
            const apiKey = this.preferenceService.get<string>(API_KEY_PREF, undefined);
            this.manager.setApiKey(apiKey);

            const models = this.preferenceService.get<string[]>(MODELS_PREF, []);
            const requestSettings = this.getRequestSettingsPref();
            this.manager.createOrUpdateLanguageModels(...models.map(modelId => this.createAnthropicModelDescription(modelId, requestSettings)));
            this.prevModels = [...models];

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === API_KEY_PREF) {
                    this.manager.setApiKey(event.newValue);
                } else if (event.preferenceName === MODELS_PREF) {
                    this.handleModelChanges(event.newValue as string[]);
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

        this.manager.removeLanguageModels(...modelsToRemove.map(model => `${ANTHROPIC_PROVIDER_ID}/${model}`));
        const requestSettings = this.getRequestSettingsPref();
        this.manager.createOrUpdateLanguageModels(...modelsToAdd.map(modelId => this.createAnthropicModelDescription(modelId, requestSettings)));
        this.prevModels = newModels;
    }

    private getRequestSettingsPref(): RequestSetting[] {
        return this.preferenceService.get<RequestSetting[]>(PREFERENCE_NAME_REQUEST_SETTINGS, []);
    }

    protected handleRequestSettingsChanges(newSettings: RequestSetting[]): void {
        const models = this.preferenceService.get<string[]>(MODELS_PREF, []);
        this.manager.createOrUpdateLanguageModels(...models.map(modelId => this.createAnthropicModelDescription(modelId, newSettings)));
    }

    protected createAnthropicModelDescription(modelId: string, requestSettings: RequestSetting[]): AnthropicModelDescription {
        const id = `${ANTHROPIC_PROVIDER_ID}/${modelId}`;
        const modelRequestSetting = this.getMatchingRequestSetting(modelId, ANTHROPIC_PROVIDER_ID, requestSettings);
        const maxTokens = DEFAULT_MODEL_MAX_TOKENS[modelId];

        const description: AnthropicModelDescription = {
            id: id,
            model: modelId,
            apiKey: true,
            enableStreaming: true,
            defaultRequestSettings: modelRequestSetting?.requestSettings
        };

        if (maxTokens !== undefined) {
            description.maxTokens = maxTokens;
        }

        return description;
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
