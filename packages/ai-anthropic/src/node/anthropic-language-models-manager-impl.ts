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

import { LanguageModelRegistry, LanguageModelStatus, TokenUsageService } from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { AnthropicModel, DEFAULT_MAX_TOKENS } from './anthropic-language-model';
import { AnthropicLanguageModelsManager, AnthropicModelDescription } from '../common';

@injectable()
export class AnthropicLanguageModelsManagerImpl implements AnthropicLanguageModelsManager {

    protected _apiKey: string | undefined;

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    @inject(TokenUsageService)
    protected readonly tokenUsageService: TokenUsageService;

    get apiKey(): string | undefined {
        return this._apiKey ?? process.env.ANTHROPIC_API_KEY;
    }

    async createOrUpdateLanguageModels(...modelDescriptions: AnthropicModelDescription[]): Promise<void> {
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

            // Determine status based on API key presence
            const effectiveApiKey = apiKeyProvider();
            const status = this.getStatusForApiKey(effectiveApiKey);

            if (model) {
                if (!(model instanceof AnthropicModel)) {
                    console.warn(`Anthropic: model ${modelDescription.id} is not an Anthropic model`);
                    continue;
                }
                await this.languageModelRegistry.patchLanguageModel<AnthropicModel>(modelDescription.id, {
                    model: modelDescription.model,
                    enableStreaming: modelDescription.enableStreaming,
                    apiKey: apiKeyProvider,
                    status,
                    maxTokens: modelDescription.maxTokens !== undefined ? modelDescription.maxTokens : DEFAULT_MAX_TOKENS,
                    maxRetries: modelDescription.maxRetries
                });
            } else {
                this.languageModelRegistry.addLanguageModels([
                    new AnthropicModel(
                        modelDescription.id,
                        modelDescription.model,
                        status,
                        modelDescription.enableStreaming,
                        modelDescription.useCaching,
                        apiKeyProvider,
                        modelDescription.maxTokens,
                        modelDescription.maxRetries,
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

    /**
     * Returns the status for a language model based on the presence of an API key.
     */
    protected getStatusForApiKey(effectiveApiKey: string | undefined): LanguageModelStatus {
        return effectiveApiKey
            ? { status: 'ready' }
            : { status: 'unavailable', message: 'No API key set' };
    }
}

