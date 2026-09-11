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

import {
    ApiKeySource, DiscoveredModel, DiscoveredModels, LanguageModelRegistry, LanguageModelStatus, ModelDiscoveryResult, ReasoningApi, ReasoningSupport
} from '@theia/ai-core';
import { getProxyUrl, ModelDiscoveryFetcher } from '@theia/ai-core/lib/node';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { APIConnectionError } from '@anthropic-ai/sdk';
import type { ModelInfo } from '@anthropic-ai/sdk/resources/models';
import { AnthropicModel, createAnthropicClient, DEFAULT_MAX_TOKENS } from './anthropic-language-model';
import { ANTHROPIC_SERVER_TOOLS } from './anthropic-server-tools';
import { AnthropicLanguageModelsManager, AnthropicModelDescription } from '../common';
import { ILogger } from '@theia/core';

const ANTHROPIC_DEFAULT_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_SNAPSHOT_FILE = 'anthropic-models.json';

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
    serverSideCompactionSupport: boolean;
}

@injectable()
export class AnthropicLanguageModelsManagerImpl implements AnthropicLanguageModelsManager {

    protected _apiKey: string | undefined;
    /**
     * Whether a key found in the environment may be used. Withheld until the user confirms it, so the
     * gate sits on the key itself: every path that reaches for one — discovery, a custom endpoint, a
     * manually configured model — is covered, and revoking the consent takes effect at once.
     */
    protected _allowEnvironmentApiKey = false;
    protected _proxyUrl: string | undefined;
    // Cached `/v1/models` lookups keyed by `${baseURL}::${model}`. Successful lookups are kept for the process lifetime;
    // failed lookups are evicted so the next call retries.
    protected readonly modelInfoCache = new Map<string, Promise<ModelInfo>>();

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    @inject(ILogger) @named('ai-anthropic:AnthropicLanguageModelsManagerImpl')
    protected readonly logger: ILogger;

    @inject(ModelDiscoveryFetcher)
    protected readonly discoveryFetcher: ModelDiscoveryFetcher;

    get apiKey(): string | undefined {
        return this._apiKey ?? (this._allowEnvironmentApiKey ? process.env.ANTHROPIC_API_KEY : undefined);
    }

    async createOrUpdateLanguageModels(...modelDescriptions: AnthropicModelDescription[]): Promise<void> {
        await Promise.all(modelDescriptions.map(description => this.createOrUpdateLanguageModel(description)));
    }

    async getApiKeySource(): Promise<ApiKeySource> {
        if (this._apiKey) {
            return 'preference';
        }
        if (process.env.ANTHROPIC_API_KEY) {
            return 'environment';
        }
        return 'none';
    }

    async fetchAvailableModels(): Promise<ModelDiscoveryResult> {
        const apiKey = this.apiKey;
        if (!apiKey) {
            return { models: [], fromCache: false };
        }
        const proxyUrl = getProxyUrl(ANTHROPIC_DEFAULT_BASE_URL, this._proxyUrl);
        return this.discoveryFetcher.fetch({
            snapshotFile: ANTHROPIC_SNAPSHOT_FILE,
            providerLabel: 'Anthropic',
            listModels: async () => this.toDiscoveredModels(await this.listModels(apiKey, proxyUrl)),
            // Retry only transient connection errors; auth/HTTP errors fail fast.
            isRetryable: error => error instanceof APIConnectionError
        });
    }

    /**
     * Maps the endpoint's entries onto {@link DiscoveredModel}s, deduplicating defensively and adding
     * the undated alias of every release-pinned id. The endpoint lists the newest models first, an
     * order worth preserving for anything that registers them in sequence.
     */
    protected toDiscoveredModels(models: ModelInfo[]): DiscoveredModel[] {
        const byId = new Map<string, DiscoveredModel>();
        for (const model of models) {
            if (!byId.has(model.id)) {
                byId.set(model.id, {
                    id: model.id,
                    label: model.display_name,
                    released: model.created_at ? Date.parse(model.created_at) || undefined : undefined
                });
            }
        }
        return DiscoveredModels.withUndatedAliases([...byId.values()]);
    }

    /** Iterates the (auto-paginated) `/v1/models` endpoint. Overridable for testing. */
    protected async listModels(apiKey: string, proxyUrl: string | undefined): Promise<ModelInfo[]> {
        const anthropic = createAnthropicClient({ apiKey, proxyUrl });
        const models: ModelInfo[] = [];
        for await (const model of anthropic.models.list()) {
            models.push(model);
        }
        return models;
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
                this.logger.warn(`Anthropic: model ${modelDescription.id} is not an Anthropic model`);
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
                maxInputTokens: metadata.maxInputTokens,
                serverSideCompactionSupport: metadata.serverSideCompactionSupport,
                serverSideCompactionEnabledByDefault: modelDescription.serverSideCompactionEnabledByDefault ?? false,
                serverSideCompactionTokenThresholdByDefault: modelDescription.serverSideCompactionTokenThresholdByDefault
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
                    metadata.maxInputTokens,
                    ANTHROPIC_SERVER_TOOLS,
                    metadata.serverSideCompactionSupport,
                    modelDescription.serverSideCompactionEnabledByDefault ?? false,
                    modelDescription.serverSideCompactionTokenThresholdByDefault,
                    modelDescription.released
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
            supportsXHighEffort: this.deriveSupportsXHighEffort(info),
            serverSideCompactionSupport: this.deriveServerSideCompactionSupport(description)
        };
    }

    /**
     * Server-side compaction (`compact_20260112`) is available on Claude Opus and Sonnet 4.6 and later.
     * Heuristic over the model id; override to read the capability from the `/v1/models` endpoint or for custom endpoints.
     */
    protected deriveServerSideCompactionSupport(description: AnthropicModelDescription): boolean {
        // The minor segment is optional: dateless major releases omit it (e.g. claude-opus-5, claude-sonnet-5).
        const match = /(opus|sonnet)-(\d+)(?:-(\d+))?/.exec(description.model);
        if (!match) {
            return false;
        }
        const major = Number(match[2]);
        // A 4+ digit "major" is a date-style id (e.g. claude-3-opus-20240229), not a versioned model.
        if (major >= 1000) {
            return false;
        }
        // A 4+ digit "minor" is a date suffix on a `.0` model id (e.g. claude-sonnet-4-20250514), not a minor version.
        const minor = Number(match[3]) >= 1000 ? 0 : Number(match[3]);
        return major > 4 || (major === 4 && minor >= 6);
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
            this.logger.warn(`Anthropic: failed to retrieve model info for '${modelDescription.id}':`,
                error instanceof Error ? error.message : error);
            return undefined;
        }
    }

    protected retrieveModelInfo(
        modelDescription: AnthropicModelDescription,
        apiKey: string,
        proxyUrl: string | undefined
    ): Promise<ModelInfo> {
        const anthropic = createAnthropicClient({ apiKey, baseURL: modelDescription.url, proxyUrl });
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

    setAllowEnvironmentApiKey(allowed: boolean): void {
        this._allowEnvironmentApiKey = allowed;
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
