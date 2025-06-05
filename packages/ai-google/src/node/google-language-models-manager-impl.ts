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

import { LanguageModelRegistry, LanguageModelStatus, TokenUsageService } from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { GoogleModel } from './google-language-model';
import { GoogleLanguageModelsManager, GoogleModelDescription } from '../common';

@injectable()
export class GoogleLanguageModelsManagerImpl implements GoogleLanguageModelsManager {

    protected _apiKey: string | undefined;

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    @inject(TokenUsageService)
    protected readonly tokenUsageService: TokenUsageService;

    get apiKey(): string | undefined {
        return this._apiKey ?? process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    }

    protected calculateStatus(effectiveApiKey: string | undefined): LanguageModelStatus {
        return effectiveApiKey
            ? { status: 'ready' }
            : { status: 'unavailable', message: 'No Google API key set' };
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

            // Determine the effective API key for status
            const status = this.calculateStatus(apiKeyProvider());

            if (model) {
                if (!(model instanceof GoogleModel)) {
                    console.warn(`Gemini: model ${modelDescription.id} is not a Gemini model`);
                    continue;
                }
                model.model = modelDescription.model;
                model.enableStreaming = modelDescription.enableStreaming;
                model.apiKey = apiKeyProvider;
                model.status = status;
            } else {
                this.languageModelRegistry.addLanguageModels([
                    new GoogleModel(
                        modelDescription.id,
                        modelDescription.model,
                        status,
                        modelDescription.enableStreaming,
                        apiKeyProvider,
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
}
