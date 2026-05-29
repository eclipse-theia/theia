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

import { LanguageModelRegistry, LanguageModelStatus, ReasoningApi, ReasoningLevel, ReasoningSupport } from '@theia/ai-core';
import { createProxyFetch, getProxyUrl } from '@theia/ai-core/lib/node';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Anthropic } from '@anthropic-ai/sdk';
import type { ModelInfo } from '@anthropic-ai/sdk/resources/models';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AnthropicModel, DEFAULT_MAX_TOKENS } from './anthropic-language-model';
import { AnthropicLanguageModelsManager, AnthropicModelDescription } from '../common';

/**
 * Full set of graded levels for Anthropic reasoning. Used as the default when the API does not
 * publish per-level effort flags (legacy `'budget'` API, where `budget_tokens` is a continuous knob).
 */
const ANTHROPIC_FULL_REASONING_LEVELS: readonly ReasoningLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'auto'];

const ANTHROPIC_PROVIDER_ID = 'anthropic';
const DEFAULT_ANTHROPIC_ENDPOINT = 'https://api.anthropic.com';
const SNAPSHOT_FILE_NAME = 'anthropic-models.json';
const LIST_PAGE_SIZE = 100;

interface ResolvedModelMetadata {
    name?: string;
    vendor?: string;
    family?: string;
    maxInputTokens?: number;
    maxTokens: number;
    maxOutputTokens?: number;
    reasoningSupport?: ReasoningSupport;
    reasoningApi?: ReasoningApi;
    supportsXHighEffort?: boolean;
}

interface ModelSnapshot {
    /** ISO timestamp of when the snapshot was fetched. */
    readonly fetchedAt: string;
    /** Endpoint the snapshot was fetched against (default: official Anthropic endpoint). */
    readonly endpoint: string;
    /** The raw `/v1/models` response data array. */
    readonly response: {
        readonly data: ModelInfo[];
    };
}

@injectable()
export class AnthropicLanguageModelsManagerImpl implements AnthropicLanguageModelsManager {

    protected _apiKey: string | undefined;
    protected _proxyUrl: string | undefined;
    /** Retry count applied to discovered official model descriptors; mirrors `ai-features.maxRetries`. */
    protected _maxRetries: number = 3;
    // Cached `/v1/models` lookups keyed by `${baseURL}::${model}`. Successful lookups are kept for the process lifetime;
    // failed lookups are evicted so the next call retries.
    protected readonly modelInfoCache = new Map<string, Promise<ModelInfo>>();

    /** IDs (`provider/model`) of officially discovered models, tracked so we can prune entries that disappear on refresh. */
    protected readonly discoveredModelIds = new Set<string>();
    /** Shared in-flight discovery promise so concurrent callers do not trigger redundant work. */
    protected discoveryInFlight: Promise<void> | undefined;

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    @inject(EnvVariablesServer)
    protected readonly envVariablesServer: EnvVariablesServer;

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
        const proxyUrl = getProxyUrl(modelDescription.url ?? DEFAULT_ANTHROPIC_ENDPOINT, this._proxyUrl);

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
                maxInputTokens: metadata.maxInputTokens,
                name: metadata.name,
                vendor: metadata.vendor,
                family: metadata.family,
                maxOutputTokens: metadata.maxOutputTokens
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
                    metadata.name,
                    metadata.vendor,
                    metadata.family,
                    metadata.maxOutputTokens
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
        const maxTokens = info?.max_tokens ?? DEFAULT_MAX_TOKENS;
        // The API's `display_name` is the canonical human-readable name; it populates `name` so other
        // consumers (selectors, settings UI, tooltips) can use it. The chat-input dropdown intentionally
        // renders `model.id` rather than `model.name` so its label always equals the value actually selected
        // — see `language-model-renderer.tsx` and `model-aliases-configuration-widget.tsx`.
        return {
            name: info?.display_name,
            vendor: 'Anthropic',
            family: this.deriveFamily(description.model),
            maxInputTokens: info?.max_input_tokens ?? undefined,
            maxTokens,
            // The Messages API returns a single output cap; mirror it onto the metadata so the UI sees it.
            maxOutputTokens: info?.max_tokens ?? undefined,
            reasoningSupport: this.deriveReasoningSupport(info),
            reasoningApi,
            supportsXHighEffort: this.deriveSupportsXHighEffort(info)
        };
    }

    protected async fetchModelInfo(
        modelDescription: AnthropicModelDescription,
        apiKey: string | undefined,
        proxyUrl: string | undefined
    ): Promise<ModelInfo | undefined> {
        // Consult the cache first — discovered models prime it from the snapshot, so the metadata is still
        // available even when no API key is currently configured (e.g. user cleared the key after discovery).
        const cacheKey = this.cacheKeyFor(modelDescription.url, modelDescription.model);
        const cached = this.modelInfoCache.get(cacheKey);
        if (cached) {
            return cached;
        }
        if (!apiKey) {
            return undefined;
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
        if (thinking.types?.adaptive?.supported) {
            return 'effort';
        }
        if (thinking.types?.enabled?.supported) {
            return 'budget';
        }
        return undefined;
    }

    protected deriveSupportsXHighEffort(info: ModelInfo | undefined): boolean | undefined {
        const xhigh = info?.capabilities?.effort?.xhigh;
        return xhigh ? !!xhigh.supported : undefined;
    }

    /**
     * Derives a per-model {@link ReasoningSupport} from the API's `capabilities.thinking` /
     * `capabilities.effort` flags.
     *
     * - Models without `thinking.supported` get `undefined` — the chat-input selector is hidden.
     * - Models on the legacy `'budget'` API expose all six levels (budget tokens scale smoothly).
     * - Models on the adaptive `'effort'` API expose `off`/`auto` plus whichever graded levels the API
     *   reports. The mapping mirrors {@link anthropicReasoningFor}:
     *   - `minimal` requires `effort.low`
     *   - `low`     requires `effort.medium`
     *   - `medium`  requires `effort.high` or `effort.xhigh`
     *   - `high`    requires `effort.max`
     *
     *   When `effort.supported === false` (e.g. Haiku 4.5 — adaptive thinking only, no graded effort),
     *   the result collapses to `['off', 'auto']`.
     */
    protected deriveReasoningSupport(info: ModelInfo | undefined): ReasoningSupport | undefined {
        const thinking = info?.capabilities?.thinking;
        if (!thinking?.supported) {
            return undefined;
        }
        const reasoningApi = this.deriveReasoningApi(info);
        if (!reasoningApi) {
            // thinking is supported but neither known API shape is — nothing actionable to expose.
            return undefined;
        }
        if (reasoningApi === 'budget') {
            return { supportedLevels: [...ANTHROPIC_FULL_REASONING_LEVELS], defaultLevel: 'auto' };
        }
        // 'effort' API: derive the graded set from per-level supported flags.
        const effort = info?.capabilities?.effort;
        const levels: ReasoningLevel[] = ['off'];
        if (effort?.supported) {
            if (effort.low?.supported) {
                levels.push('minimal');
            }
            if (effort.medium?.supported) {
                levels.push('low');
            }
            if (effort.high?.supported || effort.xhigh?.supported) {
                levels.push('medium');
            }
            if (effort.max?.supported) {
                levels.push('high');
            }
        }
        levels.push('auto');
        return { supportedLevels: levels, defaultLevel: 'auto' };
    }

    /** Returns a coarse family identifier (e.g. 'claude-opus', 'claude-sonnet'); falls back to undefined for unrecognized ids. */
    protected deriveFamily(modelId: string): string | undefined {
        const match = modelId.match(/^(claude-(?:opus|sonnet|haiku))(?:-|$)/i);
        return match ? match[1].toLowerCase() : undefined;
    }

    /**
     * Discovers official Anthropic models. Uses the persisted snapshot when present unless {@link force} is true.
     * Concurrent non-force invocations share the same in-flight promise. A {@link force} call always runs
     * a real fetch — if one is already in flight, it is chained after it so the user always gets fresh data.
     */
    async discoverModels(force: boolean = false): Promise<void> {
        if (force) {
            const previous = this.discoveryInFlight ?? Promise.resolve();
            // Capture the wrapped promise so the finally cleanup can identity-compare against the same
            // object that we store in `discoveryInFlight` (`Promise.finally` returns a *new* promise).
            const wrapped: Promise<void> = previous
                .catch(() => undefined)
                .then(() => this.doDiscoverModels(true))
                .finally(() => {
                    if (this.discoveryInFlight === wrapped) {
                        this.discoveryInFlight = undefined;
                    }
                });
            this.discoveryInFlight = wrapped;
            return wrapped;
        }
        if (!this.discoveryInFlight) {
            this.discoveryInFlight = this.doDiscoverModels(false).finally(() => {
                this.discoveryInFlight = undefined;
            });
        }
        return this.discoveryInFlight;
    }

    async refreshModels(): Promise<void> {
        await this.discoverModels(true);
    }

    protected async doDiscoverModels(force: boolean): Promise<void> {
        const apiKey = this.apiKey;
        let snapshot: ModelSnapshot | undefined;
        if (!force) {
            snapshot = await this.loadSnapshot();
        }
        if (!snapshot) {
            if (!apiKey) {
                // No key and no cached snapshot: nothing to register. Frontend retries this on key change.
                return;
            }
            try {
                snapshot = await this.fetchSnapshot(apiKey);
                await this.saveSnapshot(snapshot);
            } catch (error) {
                console.warn('Anthropic: failed to discover models from /v1/models:',
                    error instanceof Error ? error.message : error);
                return;
            }
        }

        const entries = snapshot.response.data;
        const newIds = new Set<string>();
        const descriptions: AnthropicModelDescription[] = [];
        for (const info of entries) {
            const id = `${ANTHROPIC_PROVIDER_ID}/${info.id}`;
            newIds.add(id);
            // Prime the per-model cache so createOrUpdateLanguageModel does not trigger a separate retrieve() call.
            const cacheKey = this.cacheKeyFor(undefined, info.id);
            if (!this.modelInfoCache.has(cacheKey)) {
                this.modelInfoCache.set(cacheKey, Promise.resolve(info));
            }
            descriptions.push({
                id,
                model: info.id,
                apiKey: true,
                enableStreaming: true,
                useCaching: true,
                maxRetries: this._maxRetries
            });
        }

        // Remove previously discovered models that disappeared from the new list.
        const toRemove = [...this.discoveredModelIds].filter(id => !newIds.has(id));
        if (toRemove.length > 0) {
            this.removeLanguageModels(...toRemove);
        }

        await this.createOrUpdateLanguageModels(...descriptions);

        this.discoveredModelIds.clear();
        newIds.forEach(id => this.discoveredModelIds.add(id));
    }

    /** Drains the auto-paginating `/v1/models` response into a snapshot. */
    protected async fetchSnapshot(apiKey: string): Promise<ModelSnapshot> {
        const anthropic = new Anthropic({
            apiKey,
            fetch: createProxyFetch(this._proxyUrl)
        });
        const data: ModelInfo[] = [];
        for await (const info of anthropic.models.list({ limit: LIST_PAGE_SIZE })) {
            data.push(info);
        }
        return {
            fetchedAt: new Date().toISOString(),
            endpoint: DEFAULT_ANTHROPIC_ENDPOINT,
            response: { data }
        };
    }

    protected async getSnapshotPath(): Promise<string> {
        const configDirUri = await this.envVariablesServer.getConfigDirUri();
        const configDirPath = FileUri.fsPath(configDirUri);
        return path.join(configDirPath, SNAPSHOT_FILE_NAME);
    }

    protected async loadSnapshot(): Promise<ModelSnapshot | undefined> {
        try {
            const filePath = await this.getSnapshotPath();
            const content = await fs.readFile(filePath, 'utf8');
            const parsed = JSON.parse(content) as Partial<ModelSnapshot>;
            if (!parsed?.response?.data || !Array.isArray(parsed.response.data)) {
                return undefined;
            }
            return parsed as ModelSnapshot;
        } catch (error) {
            const code = (error as NodeJS.ErrnoException | undefined)?.code;
            if (code !== 'ENOENT') {
                console.warn('Anthropic: failed to read model snapshot:',
                    error instanceof Error ? error.message : error);
            }
            return undefined;
        }
    }

    protected async saveSnapshot(snapshot: ModelSnapshot): Promise<void> {
        try {
            const filePath = await this.getSnapshotPath();
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, JSON.stringify(snapshot, undefined, 2), 'utf8');
        } catch (error) {
            console.warn('Anthropic: failed to persist model snapshot:',
                error instanceof Error ? error.message : error);
        }
    }

    protected cacheKeyFor(baseUrl: string | undefined, model: string): string {
        return `${baseUrl ?? ''}::${model}`;
    }

    removeLanguageModels(...modelIds: string[]): void {
        this.languageModelRegistry.removeLanguageModels(modelIds);
        modelIds.forEach(id => this.discoveredModelIds.delete(id));
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

    setMaxRetries(maxRetries: number): void {
        this._maxRetries = maxRetries;
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
