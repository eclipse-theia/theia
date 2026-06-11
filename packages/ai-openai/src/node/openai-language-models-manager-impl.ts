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

import { LanguageModelRegistry, LanguageModelStatus, ReasoningSupport } from '@theia/ai-core';
import { getProxyUrl } from '@theia/ai-core/lib/node';
import { inject, injectable } from '@theia/core/shared/inversify';
import { DeveloperMessageSettings, OpenAiModel, OpenAiModelUtils } from './openai-language-model';
import { OpenAiResponseApiUtils } from './openai-response-api-utils';
import { getOpenAiModelDefaults } from './openai-model-defaults';
import { OpenAiLanguageModelsManager, OpenAiModelDescription } from '../common';

interface ResolvedModelMetadata {
    maxInputTokens?: number;
    reasoningSupport?: ReasoningSupport;
    developerMessageSettings: DeveloperMessageSettings;
    enableStreaming: boolean;
    supportsStructuredOutput: boolean;
}

@injectable()
export class OpenAiLanguageModelsManagerImpl implements OpenAiLanguageModelsManager {

    @inject(OpenAiModelUtils)
    protected readonly openAiModelUtils: OpenAiModelUtils;

    @inject(OpenAiResponseApiUtils)
    protected readonly responseApiUtils: OpenAiResponseApiUtils;

    protected _apiKey: string | undefined;
    protected _apiVersion: string | undefined;
    protected _proxyUrl: string | undefined;

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    get apiKey(): string | undefined {
        return this._apiKey ?? process.env.OPENAI_API_KEY;
    }

    get apiVersion(): string | undefined {
        return this._apiVersion ?? process.env.OPENAI_API_VERSION;
    }

    protected calculateStatus(modelDescription: OpenAiModelDescription, effectiveApiKey: string | undefined): LanguageModelStatus {
        // Custom models (with `url`) are always marked ready since their API key requirements are unknown.
        if (modelDescription.url) {
            return { status: 'ready' };
        }
        return effectiveApiKey
            ? { status: 'ready' }
            : { status: 'unavailable', message: 'No OpenAI API key set' };
    }

    // Triggered from frontend. In case you want to use the models on the backend
    // without a frontend then call this yourself
    async createOrUpdateLanguageModels(...modelDescriptions: OpenAiModelDescription[]): Promise<void> {
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
            const apiVersionProvider = () => {
                if (modelDescription.apiVersion === true) {
                    return this.apiVersion;
                }
                if (modelDescription.apiVersion) {
                    return modelDescription.apiVersion;
                }
                return undefined;
            };
            const proxyUrl = getProxyUrl(modelDescription.url ?? 'https://api.openai.com', this._proxyUrl);

            const status = this.calculateStatus(modelDescription, apiKeyProvider());
            const metadata = this.resolveMetadata(modelDescription);

            if (model) {
                if (!(model instanceof OpenAiModel)) {
                    console.warn(`OpenAI: model ${modelDescription.id} is not an OpenAI model`);
                    continue;
                }
                await this.languageModelRegistry.patchLanguageModel<OpenAiModel>(modelDescription.id, {
                    model: modelDescription.model,
                    enableStreaming: metadata.enableStreaming,
                    url: modelDescription.url,
                    apiKey: apiKeyProvider,
                    apiVersion: apiVersionProvider,
                    deployment: modelDescription.deployment,
                    developerMessageSettings: metadata.developerMessageSettings,
                    supportsStructuredOutput: metadata.supportsStructuredOutput,
                    status,
                    maxRetries: modelDescription.maxRetries,
                    useResponseApi: modelDescription.useResponseApi ?? false,
                    proxy: proxyUrl,
                    reasoningSupport: metadata.reasoningSupport,
                    maxInputTokens: metadata.maxInputTokens
                });
            } else {
                this.languageModelRegistry.addLanguageModels([
                    new OpenAiModel(
                        modelDescription.id,
                        modelDescription.model,
                        status,
                        metadata.enableStreaming,
                        apiKeyProvider,
                        apiVersionProvider,
                        metadata.supportsStructuredOutput,
                        modelDescription.url,
                        modelDescription.deployment,
                        this.openAiModelUtils,
                        this.responseApiUtils,
                        metadata.developerMessageSettings,
                        modelDescription.maxRetries,
                        modelDescription.useResponseApi ?? false,
                        proxyUrl,
                        metadata.reasoningSupport,
                        metadata.maxInputTokens
                    )
                ]);
            }
        }
    }

    /**
     * Merges description overrides with model-id-based defaults from {@link getOpenAiModelDefaults}.
     * Description fields win, allowing custom-endpoint preferences to override capabilities for
     * non-OpenAI models. Custom endpoints (with a `url`) skip the context window lookup since we
     * don't know which model is actually behind the endpoint.
     */
    protected resolveMetadata(description: OpenAiModelDescription): ResolvedModelMetadata {
        const defaults = getOpenAiModelDefaults(description.model);
        return {
            maxInputTokens: description.url ? undefined : defaults.contextWindow,
            reasoningSupport: description.reasoningSupport ?? defaults.reasoningSupport,
            developerMessageSettings: description.developerMessageSettings ?? defaults.developerMessageSettings ?? 'developer',
            enableStreaming: description.enableStreaming ?? defaults.supportsStreaming ?? true,
            supportsStructuredOutput: description.supportsStructuredOutput ?? defaults.supportsStructuredOutput ?? true
        };
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

    setApiVersion(apiVersion: string | undefined): void {
        if (apiVersion) {
            this._apiVersion = apiVersion;
        } else {
            this._apiVersion = undefined;
        }
    }

    setProxyUrl(proxyUrl: string | undefined): void {
        if (proxyUrl) {
            this._proxyUrl = proxyUrl;
        } else {
            this._proxyUrl = undefined;
        }
    }
}
