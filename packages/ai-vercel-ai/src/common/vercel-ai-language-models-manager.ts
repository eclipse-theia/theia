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
export const VERCEL_AI_LANGUAGE_MODELS_MANAGER_PATH = '/services/vercel-ai/language-model-manager';

export type VercelAiProvider = 'openai' | 'anthropic';

export interface VercelAiProviderConfig {
    provider: VercelAiProvider;
    apiKey?: string;
    baseURL?: string;
}

export interface VercelAiModelDescription {
    /**
     * The identifier of the model which will be shown in the UI.
     */
    id: string;
    /**
     * The model ID as used by the Vercel AI SDK.
     */
    model: string;
    /**
     * The provider of the model (openai, anthropic, etc.)
     */
    provider?: VercelAiProvider;
    /**
     * The API base URL where the model is hosted. If not provided the default provider endpoint will be used.
     */
    url?: string;
    /**
     * The key for the model. If 'true' is provided the global provider API key will be used.
     */
    apiKey: string | true | undefined;
    /**
     * Controls whether streaming is enabled for this model.
     */
    enableStreaming: boolean;
    /**
     * Flag to configure whether the model supports structured output. Default is `true`.
     */
    supportsStructuredOutput: boolean;
    /**
     * Maximum number of retry attempts when a request fails. Default is 3.
     */
    maxRetries: number;
}

export const VercelAiLanguageModelsManager = Symbol('VercelAiLanguageModelsManager');
export interface VercelAiLanguageModelsManager {
    apiKey: string | undefined;
    setProviderConfig(provider: VercelAiProvider, config: Partial<VercelAiProviderConfig>): void;
    createOrUpdateLanguageModels(...models: VercelAiModelDescription[]): Promise<void>;
    removeLanguageModels(...modelIds: string[]): void;
}
