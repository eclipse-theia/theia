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

import { LanguageModelRegistry, TokenUsageService } from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { GoogleModel } from './google-language-model';
import { GoogleLanguageModelsManager, GoogleModelDescription } from '../common';

export interface GoogleLanguageModelRetrySettings {
    maxRetriesOnErrors: number;
    retryDelayOnRateLimitError: number;
    retryDelayOnOtherErrors: number;
}

@injectable()
export class GoogleLanguageModelsManagerImpl implements GoogleLanguageModelsManager {
    protected _apiKey: string | undefined;
    protected retrySettings: GoogleLanguageModelRetrySettings = {
        maxRetriesOnErrors: 3,
        retryDelayOnRateLimitError: 60,
        retryDelayOnOtherErrors: -1
    };

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    @inject(TokenUsageService)
    protected readonly tokenUsageService: TokenUsageService;

    get apiKey(): string | undefined {
        return this._apiKey ?? process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    }

    async createOrUpdateLanguageModels(...modelDescriptions: GoogleModelDescription[]): Promise<void> {
        for (const modelDescription of modelDescriptions) {
            const model = await this.languageModelRegistry.getLanguageModel(modelDescription.id);
            const apiKeyProvider = () => {
                if (modelDescription.apiKey === true) {
                    return this.apiKey;
                }
                if (modelDescription.apiKey) {
                    return modelDescription.apiKey;
                }
                return undefined;
            };
            const retrySettingsProvider = () => this.retrySettings;

            if (model) {
                if (!(model instanceof GoogleModel)) {
                    console.warn(`Gemini: model ${modelDescription.id} is not a Gemini model`);
                    continue;
                }
                model.model = modelDescription.model;
                model.enableStreaming = modelDescription.enableStreaming;
                model.apiKey = apiKeyProvider;
                model.retrySettings = retrySettingsProvider;
            } else {
                this.languageModelRegistry.addLanguageModels([
                    new GoogleModel(
                        modelDescription.id,
                        modelDescription.model,
                        modelDescription.enableStreaming,
                        apiKeyProvider,
                        retrySettingsProvider,
                        this.tokenUsageService
                    )
                ]);
            }
        }
    }

    removeLanguageModels(...modelIds: string[]): void {
        this.languageModelRegistry.removeLanguageModels(modelIds);
    }

    setApiKey(apiKey: string | undefined): void {
        if (apiKey) {
            this._apiKey = apiKey;
        } else {
            this._apiKey = undefined;
        }
    }

    setMaxRetriesOnErrors(maxRetries: number): void {
        this.retrySettings.maxRetriesOnErrors = maxRetries;
    }

    setRetryDelayOnRateLimitError(retryDelay: number): void {
        this.retrySettings.retryDelayOnRateLimitError = retryDelay;
    }

    setRetryDelayOnOtherErrors(retryDelay: number): void {
        this.retrySettings.retryDelayOnOtherErrors = retryDelay;
    }
}
