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
    ApiKeySource, DiscoveredModel, DiscoveredModels, LanguageModelRegistry, LanguageModelStatus, ModelDiscoveryResult, ReasoningSupport
} from '@theia/ai-core';
import { getProxyUrl, ModelDiscoveryFetcher } from '@theia/ai-core/lib/node';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { APIConnectionError } from 'openai';
import { createOpenAiClient, DeveloperMessageSettings, OpenAiModel, OpenAiModelUtils } from './openai-language-model';
import { OpenAiResponseApiUtils } from './openai-response-api-utils';
import { getOpenAiModelDefaults } from './openai-model-defaults';
import { OpenAiLanguageModelsManager, OpenAiModelDescription } from '../common';
import { ILogger } from '@theia/core';
import { OPENAI_SERVER_TOOLS } from './openai-server-tools';

const OPENAI_SNAPSHOT_FILE = 'openai-models.json';

/** The part of an OpenAI `/v1/models` entry this manager reads. */
interface ListedOpenAiModel {
    id: string;
    /** Creation time in seconds since the epoch. */
    created?: number;
}

interface ResolvedModelMetadata {
    maxInputTokens?: number;
    reasoningSupport?: ReasoningSupport;
    developerMessageSettings: DeveloperMessageSettings;
    enableStreaming: boolean;
    supportsStructuredOutput: boolean;
    serverSideCompactionSupport: boolean;
}

@injectable()
export class OpenAiLanguageModelsManagerImpl implements OpenAiLanguageModelsManager {

    @inject(OpenAiModelUtils)
    protected readonly openAiModelUtils: OpenAiModelUtils;

    @inject(OpenAiResponseApiUtils)
    protected readonly responseApiUtils: OpenAiResponseApiUtils;

    @inject(ILogger) @named('ai-openai:OpenAiLanguageModelsManagerImpl')
    protected readonly logger: ILogger;

    protected _apiKey: string | undefined;
    /**
     * Whether a key found in the environment may be used. Withheld until the user confirms it, so the
     * gate sits on the key itself: every path that reaches for one — discovery, a custom endpoint, a
     * manually configured model — is covered, and revoking the consent takes effect at once.
     */
    protected _allowEnvironmentApiKey = false;
    protected _apiVersion: string | undefined;
    protected _proxyUrl: string | undefined;

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    @inject(ModelDiscoveryFetcher)
    protected readonly discoveryFetcher: ModelDiscoveryFetcher;

    get apiKey(): string | undefined {
        return this._apiKey ?? (this._allowEnvironmentApiKey ? process.env.OPENAI_API_KEY : undefined);
    }

    async getApiKeySource(): Promise<ApiKeySource> {
        if (this._apiKey) {
            return 'preference';
        }
        if (process.env.OPENAI_API_KEY) {
            return 'environment';
        }
        return 'none';
    }

    async fetchAvailableModels(): Promise<ModelDiscoveryResult> {
        const apiKey = this.apiKey;
        if (!apiKey) {
            return { models: [], fromCache: false };
        }
        const proxyUrl = getProxyUrl('https://api.openai.com', this._proxyUrl);
        return this.discoveryFetcher.fetch({
            snapshotFile: OPENAI_SNAPSHOT_FILE,
            providerLabel: 'OpenAI',
            listModels: async () => this.toDiscoveredModels(await this.listModels(apiKey, proxyUrl)),
            // Retry only transient connection errors; auth/HTTP errors fail fast.
            isRetryable: error => error instanceof APIConnectionError
        });
    }

    /**
     * Maps the endpoint's entries onto {@link DiscoveredModel}s and adds the undated alias of every
     * release-pinned id. The endpoint reports no display name or description — only the id, the
     * owner and a creation timestamp — so a discovered OpenAI model carries no label.
     */
    protected toDiscoveredModels(models: ListedOpenAiModel[]): DiscoveredModel[] {
        const byId = new Map<string, DiscoveredModel>();
        for (const model of models) {
            // OpenAI's /v1/models lists every model type (embeddings, audio, image, …) with no capability
            // metadata, so we heuristically keep the text-chat families. Custom endpoints cover the rest.
            if (this.isChatModelId(model.id) && !byId.has(model.id)) {
                // `created` is in seconds; DiscoveredModel.released is in milliseconds.
                byId.set(model.id, { id: model.id, released: model.created === undefined ? undefined : model.created * 1000 });
            }
        }
        return DiscoveredModels.withUndatedAliases([...byId.values()]);
    }

    /**
     * Heuristic for the text-chat models among everything `/v1/models` reports: the `gpt-*`,
     * `chatgpt-*` and `o1`/`o3`/`o4`-style families, minus the variants that speak a different API
     * than chat completions: audio, realtime, live, transcription, speech, image, embeddings,
     * moderation, the search and computer-use tool endpoints, and the legacy `-instruct` completion
     * models.
     *
     * The terms match anywhere in the id, so a family that carries one in a longer word goes with it
     * (`o3-deep-research`, which speaks the responses API and not this one). Anything this drops or
     * misses can still be configured as a custom endpoint.
     */
    protected isChatModelId(id: string): boolean {
        if (!/^(gpt|chatgpt|o\d)/.test(id)) {
            return false;
        }
        return !/(audio|realtime|-live|transcribe|tts|image|embedding|moderation|search|computer-use|-instruct)/.test(id);
    }

    /** Iterates the (auto-paginated) `/v1/models` endpoint. Overridable for testing. */
    protected async listModels(apiKey: string, proxyUrl: string | undefined): Promise<ListedOpenAiModel[]> {
        const openai = createOpenAiClient({ apiKey, proxyUrl });
        const models: ListedOpenAiModel[] = [];
        for await (const model of openai.models.list()) {
            models.push(model);
        }
        return models;
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
            const serverTools = this.resolveServerTools(modelDescription);

            if (model) {
                if (!(model instanceof OpenAiModel)) {
                    this.logger.warn(`OpenAI: model ${modelDescription.id} is not an OpenAI model`);
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
                    maxInputTokens: metadata.maxInputTokens,
                    serverTools,
                    serverSideCompactionSupport: metadata.serverSideCompactionSupport,
                    serverSideCompactionEnabledByDefault: modelDescription.serverSideCompactionEnabledByDefault ?? false,
                    serverSideCompactionTokenThresholdByDefault: modelDescription.serverSideCompactionTokenThresholdByDefault,
                    released: modelDescription.released
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
                        metadata.maxInputTokens,
                        serverTools,
                        metadata.serverSideCompactionSupport,
                        modelDescription.serverSideCompactionEnabledByDefault ?? false,
                        modelDescription.serverSideCompactionTokenThresholdByDefault,
                        modelDescription.released
                    )
                ]);
            }
        }
    }

    protected resolveServerTools(description: OpenAiModelDescription): typeof OPENAI_SERVER_TOOLS | undefined {
        return description.useResponseApi && !description.url ? OPENAI_SERVER_TOOLS : undefined;
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
            supportsStructuredOutput: description.supportsStructuredOutput ?? defaults.supportsStructuredOutput ?? true,
            // Server-side compaction is only available via the Response API.
            serverSideCompactionSupport: description.useResponseApi ?? false
        };
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
