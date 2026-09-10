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
import { ApiKeySource, ModelDiscoveryResult, ReasoningSupport } from '@theia/ai-core';

export const OPENAI_LANGUAGE_MODELS_MANAGER_PATH = '/services/open-ai/language-model-manager';
export const OpenAiLanguageModelsManager = Symbol('OpenAiLanguageModelsManager');

export const OPENAI_PROVIDER_ID = 'openai';

export interface OpenAiModelDescription {
    /** The identifier of the model which will be shown in the UI. */
    id: string;
    /** The model ID as used by the OpenAI API. */
    model: string;
    /** The OpenAI API compatible endpoint where the model is hosted. If not provided the default OpenAI endpoint will be used. */
    url?: string;
    /** The key for the model. If `true` is provided the global OpenAI API key will be used. */
    apiKey: string | true | undefined;
    /** The version for the api. If `true` is provided the global OpenAI version will be used. */
    apiVersion: string | true | undefined;
    /** Optional deployment name for Azure OpenAI. */
    deployment?: string;
    /** Maximum number of retry attempts when a request fails. Default is 3. */
    maxRetries: number;
    /** Use the newer OpenAI Response API instead of the Chat Completion API. Default is `false`. */
    useResponseApi?: boolean;
    /** Indicate whether the streaming API shall be used. Defaults from the model id when unset. */
    enableStreaming?: boolean;
    /**
     * Configures how system messages are handled. `'user' | 'system' | 'developer'` use that role for
     * the system message; `'mergeWithFollowingUserMessage'` prepends the system message to the next
     * user message (creating one when needed); `'skip'` removes system messages. Defaults from the
     * model id when unset (typically `'developer'`).
     */
    developerMessageSettings?: 'user' | 'system' | 'developer' | 'mergeWithFollowingUserMessage' | 'skip';
    /** Whether the model supports structured output (`response_format` JSON schemas). Defaults from the model id when unset. */
    supportsStructuredOutput?: boolean;
    /** When set, the UI exposes a reasoning selector. Defaults from the model id when unset. */
    reasoningSupport?: ReasoningSupport;
    /** Resolved default enablement of server-side compaction (global preference folded with the per-provider override). Defaults to disabled when omitted. */
    serverSideCompactionEnabledByDefault?: boolean;
    /** Resolved default input-token threshold for server-side compaction. `undefined` preserves the provider default. */
    serverSideCompactionTokenThresholdByDefault?: number;
    /** Release date (ms since epoch) reported by discovery, surfaced as {@link LanguageModelMetaData.released}. */
    released?: number;
}
export interface OpenAiLanguageModelsManager {
    apiKey: string | undefined;
    setApiKey(key: string | undefined): void;
    /**
     * Allows or refuses the use of an API key found in the environment. Refused by default: an
     * environment key is only used once the user has confirmed it, and setting this back to `false`
     * stops it being used immediately, wherever it would have been used.
     */
    setAllowEnvironmentApiKey(allowed: boolean): void;
    setApiVersion(version: string | undefined): void;
    setProxyUrl(proxyUrl: string | undefined): void;
    createOrUpdateLanguageModels(...models: OpenAiModelDescription[]): Promise<void>;
    removeLanguageModels(...modelIds: string[]): void;
    /**
     * Fetches the ids of the text-chat models OpenAI currently offers from its `/v1/models` endpoint,
     * retrying transient connection failures and caching a snapshot for offline use. The endpoint
     * exposes no capability metadata, so non-chat models are filtered out heuristically. Returns an
     * empty result when no key is configured; falls back to the cached snapshot on failure.
     */
    fetchAvailableModels(): Promise<ModelDiscoveryResult>;
    /** Reports where the effective API key comes from (preference, environment, or none). */
    getApiKeySource(): Promise<ApiKeySource>;
}
