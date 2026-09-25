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
import { ApiKeySource, ModelDiscoveryResult, ReasoningApi, ReasoningSupport } from '@theia/ai-core';

export const GOOGLE_LANGUAGE_MODELS_MANAGER_PATH = '/services/google/language-model-manager';
export const GoogleLanguageModelsManager = Symbol('GoogleLanguageModelsManager');

export interface GoogleModelDescription {
    /**
     * The identifier of the model which will be shown in the UI.
     */
    id: string;
    /**
     * The model ID as used by the Google Gemini API.
     */
    model: string;
    /**
     * The key for the model. If 'true' is provided the global Gemini API key will be used.
     */
    apiKey: string | true | undefined;
    /**
     * Indicate whether the streaming API shall be used.
     */
    enableStreaming: boolean;
    /**
     * Maximum number of tokens to generate. Default is 4096.
     */
    maxTokens?: number;
    /** When set, the UI exposes a reasoning selector and requests are translated to {@link reasoningApi}. */
    reasoningSupport?: ReasoningSupport;
    /**
     * Which Gemini reasoning API shape to use. Required when `reasoningSupport` is set.
     * - `'effort'`: `thinkingConfig.thinkingLevel` (Gemini 3+)
     * - `'budget'`: `thinkingConfig.thinkingBudget` (Gemini 2.5)
     */
    reasoningApi?: ReasoningApi;
}

export interface GoogleLanguageModelsManager {
    apiKey: string | undefined;
    setApiKey(key: string | undefined): void;
    /**
     * Allows or refuses the use of an API key found in the environment. Refused by default: an
     * environment key is only used once the user has confirmed it, and setting this back to `false`
     * stops it being used immediately, wherever it would have been used.
     */
    setAllowEnvironmentApiKey(allowed: boolean): void;
    setMaxRetriesOnErrors(maxRetries: number): void;
    setRetryDelayOnRateLimitError(retryDelay: number): void;
    setRetryDelayOnOtherErrors(retryDelay: number): void;
    createOrUpdateLanguageModels(...models: GoogleModelDescription[]): Promise<void>;
    removeLanguageModels(...modelIds: string[]): void;
    /**
     * Fetches the ids of the Gemini models that currently support content generation from the
     * `/v1beta/models` endpoint, retrying transient failures and caching a snapshot for offline use.
     * Returns an empty result when no key is configured; falls back to the cached snapshot on failure.
     */
    fetchAvailableModels(): Promise<ModelDiscoveryResult>;
    /** Reports where the effective API key comes from (preference, environment, or none). */
    getApiKeySource(): Promise<ApiKeySource>;
}
