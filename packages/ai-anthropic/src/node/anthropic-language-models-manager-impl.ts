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

import { LanguageModelRegistry, LanguageModelStatus, ReasoningApi, ReasoningSupport } from '@theia/ai-core';
import { createProxyFetch, getProxyUrl } from '@theia/ai-core/lib/node';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Anthropic } from '@anthropic-ai/sdk';
import type { ModelInfo } from '@anthropic-ai/sdk/resources/models';
import { AnthropicModel, DEFAULT_MAX_TOKENS } from './anthropic-language-model';
import { AnthropicLanguageModelsManager, AnthropicModelDescription } from '../common';

const ANTHROPIC_REASONING_SUPPORT: ReasoningSupport = {
    supportedLevels: ['off', 'minimal', 'low', 'medium', 'high', 'auto'],
    defaultLevel: 'auto'
};

interface ResolvedModelMetadata {
    maxInputTokens?: number;
    maxTokens: number;
    reasoningSupport?: ReasoningSupport;
    reasoningApi?: ReasoningApi;
    supportsXHighEffort?: boolean;
}

@injectable()
export class AnthropicLanguageModelsManagerImpl implements AnthropicLanguageModelsManager {

    protected _apiKey: string | undefined;
    protected _proxyUrl: string | undefined;
    /** Cached `/v1/models` lookups keyed by `${baseURL}::${model}`. Failed lookups are evicted so the next call retries. */
    protected readonly modelInfoCache = new Map<string, Promise<ModelInfo>>();

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    get apiKey(): string | undefined {
        return this._apiKey ?? process.env.ANTHROPIC_API_KEY;
    }

    async createOrUpdateLanguageModels(...modelDescriptions: AnthropicModelDescription[]): Promise<void> {
        await Promise.all(modelDescriptions.map(description => this.createOrUpdateLanguageModel(description)));
    }

    protected async createOrUpdateLanguageModel(modelDescription: AnthropicModelDescription): Promise<void> {
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
        const proxyUrl = getProxyUrl(modelDescription.url ?? 'https://api.anthropic.com', this._proxyUrl);

        const apiKey = apiKeyProvider();
        const status = this.calculateStatus(modelDescription, apiKey);
        const metadata = await this.resolveMetadata(modelDescription, apiKey, proxyUrl);

        if (model) {
            if (!(model instanceof AnthropicModel)) {
                console.warn(`Anthropic: model ${modelDescription.id} is not an Anthropic model`);
                return;
            }
            await this.languageModelRegistry.patchLanguageModel<AnthropicModel>(modelDescription.id, {
                model: modelDescription.model,
                enableStreaming: modelDescription.enableStreaming,
                url: modelDescription.url,
                useCaching: modelDescription.useCaching,
                apiKey: apiKeyProvider,
                status,
                maxTokens: metadata.maxTokens,
                maxRetries: modelDescription.maxRetries,
                proxy: proxyUrl,
                reasoningSupport: metadata.reasoningSupport,
                reasoningApi: metadata.reasoningApi,
                supportsXHighEffort: metadata.supportsXHighEffort,
                maxInputTokens: metadata.maxInputTokens
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
                    modelDescription.url,
                    metadata.maxTokens,
                    modelDescription.maxRetries,
                    proxyUrl,
                    metadata.reasoningSupport,
                    metadata.reasoningApi,
                    metadata.supportsXHighEffort,
                    metadata.maxInputTokens
                )
            ]);
        }
    }

    /** `maxTokens` falls back to {@link DEFAULT_MAX_TOKENS} since the Messages API requires it. */
    protected async resolveMetadata(
        description: AnthropicModelDescription,
        apiKey: string | undefined,
        proxyUrl: string | undefined
    ): Promise<ResolvedModelMetadata> {
        const info = await this.fetchModelInfo(description, apiKey, proxyUrl);
        const reasoningApi = this.deriveReasoningApi(info);
        return {
            maxInputTokens: info?.max_input_tokens ?? undefined,
            maxTokens: info?.max_tokens ?? DEFAULT_MAX_TOKENS,
            reasoningSupport: reasoningApi ? ANTHROPIC_REASONING_SUPPORT : undefined,
            reasoningApi,
            supportsXHighEffort: this.deriveSupportsXHighEffort(info)
        };
    }

    protected async fetchModelInfo(
        modelDescription: AnthropicModelDescription,
        apiKey: string | undefined,
        proxyUrl: string | undefined
    ): Promise<ModelInfo | undefined> {
        if (!apiKey) {
            return undefined;
        }
        const cacheKey = `${modelDescription.url ?? ''}::${modelDescription.model}`;
        const cached = this.modelInfoCache.get(cacheKey);
        if (cached) {
            return cached;
        }
        const fetchPromise = this.retrieveModelInfo(modelDescription, apiKey, proxyUrl);
        this.modelInfoCache.set(cacheKey, fetchPromise);
        try {
            return await fetchPromise;
        } catch (error) {
            this.modelInfoCache.delete(cacheKey);
            console.warn(`Anthropic: failed to retrieve model info for '${modelDescription.id}':`,
                error instanceof Error ? error.message : error);
            return undefined;
        }
    }

    protected retrieveModelInfo(
        modelDescription: AnthropicModelDescription,
        apiKey: string,
        proxyUrl: string | undefined
    ): Promise<ModelInfo> {
        const anthropic = new Anthropic({
            apiKey,
            baseURL: modelDescription.url,
            fetch: createProxyFetch(proxyUrl)
        });
        return anthropic.models.retrieve(modelDescription.model);
    }

    /** Adaptive thinking (`effort`) is preferred when available; older 4.x models only support the legacy extended thinking (`budget`) API. */
    protected deriveReasoningApi(info: ModelInfo | undefined): ReasoningApi | undefined {
        const thinking = info?.capabilities?.thinking;
        if (!thinking?.supported) {
            return undefined;
        }
        if (thinking.types.adaptive.supported) {
            return 'effort';
        }
        if (thinking.types.enabled.supported) {
            return 'budget';
        }
        return undefined;
    }

    protected deriveSupportsXHighEffort(info: ModelInfo | undefined): boolean | undefined {
        const xhigh = info?.capabilities?.effort?.xhigh;
        return xhigh ? xhigh.supported : undefined;
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

    setProxyUrl(proxyUrl: string | undefined): void {
        if (proxyUrl) {
            this._proxyUrl = proxyUrl;
        } else {
            this._proxyUrl = undefined;
        }
    }

    protected calculateStatus(modelDescription: AnthropicModelDescription, effectiveApiKey: string | undefined): LanguageModelStatus {
        // Custom endpoints have unknown auth requirements, so we cannot derive a meaningful status.
        if (modelDescription.url) {
            return { status: 'ready' };
        }
        return effectiveApiKey
            ? { status: 'ready' }
            : { status: 'unavailable', message: 'No Anthropic API key set' };
    }
}
