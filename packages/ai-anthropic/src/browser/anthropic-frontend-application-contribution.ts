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
import { AICorePreferences, PREFERENCE_NAME_MAX_RETRIES } from '@theia/ai-core/lib/browser/ai-core-preferences';

const ANTHROPIC_PROVIDER_ID = 'anthropic';

// Model-specific maxTokens values
const DEFAULT_MODEL_MAX_TOKENS: Record<string, number> = {
    'claude-3-opus-latest': 4096,
    'claude-3-5-haiku-latest': 8192,
    'claude-3-5-sonnet-latest': 8192,
    'claude-3-7-sonnet-latest': 64000,
    'claude-opus-4-20250514': 32000,
    'claude-sonnet-4-20250514': 64000
};

@injectable()
export class AnthropicFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(AnthropicLanguageModelsManager)
    protected manager: AnthropicLanguageModelsManager;

    @inject(AICorePreferences)
    protected aiCorePreferences: AICorePreferences;

    protected prevModels: string[] = [];

    onStart(): void {
        this.preferenceService.ready.then(() => {
            const apiKey = this.preferenceService.get<string>(API_KEY_PREF, undefined);
            this.manager.setApiKey(apiKey);

            const models = this.preferenceService.get<string[]>(MODELS_PREF, []);
            this.manager.createOrUpdateLanguageModels(...models.map(modelId => this.createAnthropicModelDescription(modelId)));
            this.prevModels = [...models];

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === API_KEY_PREF) {
                    this.manager.setApiKey(event.newValue);
                } else if (event.preferenceName === MODELS_PREF) {
                    this.handleModelChanges(event.newValue as string[]);
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

        this.manager.removeLanguageModels(...modelsToRemove.map(model => `${ANTHROPIC_PROVIDER_ID}/${model}`));
        this.manager.createOrUpdateLanguageModels(...modelsToAdd.map(modelId => this.createAnthropicModelDescription(modelId)));
        this.prevModels = newModels;
    }

    protected updateAllModelsWithNewRetries(): void {
        const models = this.preferenceService.get<string[]>(MODELS_PREF, []);
        this.manager.createOrUpdateLanguageModels(...models.map(modelId => this.createAnthropicModelDescription(modelId)));
    }

    protected createAnthropicModelDescription(modelId: string): AnthropicModelDescription {
        const id = `${ANTHROPIC_PROVIDER_ID}/${modelId}`;
        const maxTokens = DEFAULT_MODEL_MAX_TOKENS[modelId];
        const maxRetries = this.aiCorePreferences.get(PREFERENCE_NAME_MAX_RETRIES) ?? 3;

        const description: AnthropicModelDescription = {
            id: id,
            model: modelId,
            apiKey: true,
            enableStreaming: true,
            useCaching: true,
            maxRetries: maxRetries
        };

        if (maxTokens !== undefined) {
            description.maxTokens = maxTokens;
        } else {
            description.maxTokens = 64000;
        }

        return description;
    }
}
