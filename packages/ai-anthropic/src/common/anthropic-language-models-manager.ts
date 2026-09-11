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

import { ApiKeySource, ModelDiscoveryResult } from '@theia/ai-core/lib/common';

export const ANTHROPIC_LANGUAGE_MODELS_MANAGER_PATH = '/services/anthropic/language-model-manager';
export const AnthropicLanguageModelsManager = Symbol('AnthropicLanguageModelsManager');

export interface AnthropicModelDescription {
    /** The identifier of the model which will be shown in the UI. */
    id: string;
    /** The model ID as used by the Anthropic API. */
    model: string;
    /** The Anthropic API compatible endpoint where the model is hosted. If not provided the default Anthropic endpoint will be used. */
    url?: string;
    /** The key for the model. If `true` is provided the global Anthropic API key will be used. */
    apiKey: string | true | undefined;
    /** Indicate whether the streaming API shall be used. */
    enableStreaming: boolean;
    /** Indicate whether the model supports prompt caching. */
    useCaching: boolean;
    /** Maximum number of retry attempts when a request fails. Default is 3. */
    maxRetries: number;
    /** Resolved default enablement of server-side compaction (global preference folded with the per-provider override). Defaults to disabled when omitted. */
    serverSideCompactionEnabledByDefault?: boolean;
    /** Release date (ms since epoch) reported by discovery, surfaced as {@link LanguageModelMetaData.released}. */
    released?: number;
    /** Resolved default input-token threshold for server-side compaction. `undefined` preserves the provider default. */
    serverSideCompactionTokenThresholdByDefault?: number;
}
export interface AnthropicLanguageModelsManager {
    apiKey: string | undefined;
    setApiKey(key: string | undefined): void;
    /**
     * Allows or refuses the use of an API key found in the environment. Refused by default: an
     * environment key is only used once the user has confirmed it, and setting this back to `false`
     * stops it being used immediately, wherever it would have been used.
     */
    setAllowEnvironmentApiKey(allowed: boolean): void;
    setProxyUrl(proxyUrl: string | undefined): void;
    createOrUpdateLanguageModels(...models: AnthropicModelDescription[]): Promise<void>;
    removeLanguageModels(...modelIds: string[]): void;
    /**
     * Fetches the models Anthropic currently offers from its `/v1/models` endpoint, retrying
     * transient connection failures and persisting a snapshot for offline use.
     *
     * Requires an API key. Returns an empty result when no key is configured. On a live-fetch
     * failure it falls back to the cached snapshot (`fromCache: true`) when one exists, and only
     * throws when there is no cache to fall back to.
     */
    fetchAvailableModels(): Promise<ModelDiscoveryResult>;
    /** Reports where the effective API key comes from (preference, environment, or none). */
    getApiKeySource(): Promise<ApiKeySource>;
}
