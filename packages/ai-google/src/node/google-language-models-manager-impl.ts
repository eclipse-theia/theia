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

import { LanguageModelRegistry, LanguageModelStatus, ReasoningApi, ReasoningSupport } from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { GoogleGenAI, Model } from '@google/genai';
import { GoogleModel } from './google-language-model';
import { GoogleLanguageModelsManager, GoogleModelDescription } from '../common';

export interface GoogleLanguageModelRetrySettings {
    maxRetriesOnErrors: number;
    retryDelayOnRateLimitError: number;
    retryDelayOnOtherErrors: number;
}

const GEMINI_REASONING_SUPPORT: ReasoningSupport = {
    supportedLevels: ['off', 'minimal', 'low', 'medium', 'high', 'auto'],
    defaultLevel: 'auto'
};

/**
 * Maps a Gemini model id to its reasoning API shape (Gemini 3 → `effort`, Gemini 2.5 → `budget`).
 * Inferred from the id because /v1beta/models only exposes a single `thinking` boolean.
 */
export function reasoningApiFromModelId(modelId: string): ReasoningApi | undefined {
    if (/^gemini-3(?:\.|-)/i.test(modelId)) {
        return 'effort';
    }
    if (/^gemini-2\.5(?:-|$)/i.test(modelId)) {
        return 'budget';
    }
    return undefined;
}

interface ResolvedModelMetadata {
    maxInputTokens?: number;
    reasoningSupport?: ReasoningSupport;
    reasoningApi?: ReasoningApi;
}

@injectable()
export class GoogleLanguageModelsManagerImpl implements GoogleLanguageModelsManager {
    protected _apiKey: string | undefined;
    protected retrySettings: GoogleLanguageModelRetrySettings = {
        maxRetriesOnErrors: 3,
        retryDelayOnRateLimitError: 60,
        retryDelayOnOtherErrors: -1
    };
    /** Cached `/v1beta/models` lookups keyed by model id. Failed lookups are evicted so the next call retries. */
    protected readonly modelInfoCache = new Map<string, Promise<Model>>();

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    get apiKey(): string | undefined {
        return this._apiKey ?? process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    }

    protected calculateStatus(effectiveApiKey: string | undefined): LanguageModelStatus {
        return effectiveApiKey
            ? { status: 'ready' }
            : { status: 'unavailable', message: 'No Google API key set' };
    }

    async createOrUpdateLanguageModels(...modelDescriptions: GoogleModelDescription[]): Promise<void> {
        await Promise.all(modelDescriptions.map(description => this.createOrUpdateLanguageModel(description)));
    }

    protected async createOrUpdateLanguageModel(modelDescription: GoogleModelDescription): Promise<void> {
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

        const apiKey = apiKeyProvider();
        const status = this.calculateStatus(apiKey);
        const metadata = await this.resolveMetadata(modelDescription, apiKey);

        if (model) {
            if (!(model instanceof GoogleModel)) {
                console.warn(`Gemini: model ${modelDescription.id} is not a Gemini model`);
                return;
            }
            await this.languageModelRegistry.patchLanguageModel<GoogleModel>(modelDescription.id, {
                model: modelDescription.model,
                enableStreaming: modelDescription.enableStreaming,
                apiKey: apiKeyProvider,
                retrySettings: retrySettingsProvider,
                status,
                reasoningSupport: metadata.reasoningSupport,
                reasoningApi: metadata.reasoningApi,
                maxInputTokens: metadata.maxInputTokens
            });
        } else {
            this.languageModelRegistry.addLanguageModels([
                new GoogleModel(
                    modelDescription.id,
                    modelDescription.model,
                    status,
                    modelDescription.enableStreaming,
                    apiKeyProvider,
                    retrySettingsProvider,
                    metadata.reasoningSupport,
                    metadata.reasoningApi,
                    metadata.maxInputTokens
                )
            ]);
        }
    }

    /** Description overrides win over the values derived from /v1beta/models. */
    protected async resolveMetadata(description: GoogleModelDescription, apiKey: string | undefined): Promise<ResolvedModelMetadata> {
        const info = await this.fetchModelInfo(description, apiKey);
        const reasoningApi = description.reasoningApi ?? this.deriveReasoningApi(description.model, info);
        return {
            maxInputTokens: info?.inputTokenLimit,
            reasoningSupport: description.reasoningSupport ?? (reasoningApi ? GEMINI_REASONING_SUPPORT : undefined),
            reasoningApi
        };
    }

    protected async fetchModelInfo(modelDescription: GoogleModelDescription, apiKey: string | undefined): Promise<Model | undefined> {
        if (!apiKey) {
            return undefined;
        }
        const cacheKey = modelDescription.model;
        const cached = this.modelInfoCache.get(cacheKey);
        if (cached) {
            return cached;
        }
        const fetchPromise = this.retrieveModelInfo(modelDescription, apiKey);
        this.modelInfoCache.set(cacheKey, fetchPromise);
        try {
            return await fetchPromise;
        } catch (error) {
            this.modelInfoCache.delete(cacheKey);
            console.warn(`Gemini: failed to retrieve model info for '${modelDescription.id}':`,
                error instanceof Error ? error.message : error);
            return undefined;
        }
    }

    protected retrieveModelInfo(modelDescription: GoogleModelDescription, apiKey: string): Promise<Model> {
        const genAI = new GoogleGenAI({ apiKey, vertexai: false });
        return genAI.models.get({ model: modelDescription.model });
    }

    /** API `thinking=false` disables reasoning even when the model id suggests support. */
    protected deriveReasoningApi(modelId: string, info: Model | undefined): ReasoningApi | undefined {
        if (info?.thinking === false) {
            return undefined;
        }
        return reasoningApiFromModelId(modelId);
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
