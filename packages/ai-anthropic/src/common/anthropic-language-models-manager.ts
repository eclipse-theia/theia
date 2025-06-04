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
export const ANTHROPIC_LANGUAGE_MODELS_MANAGER_PATH = '/services/anthropic/language-model-manager';
export const AnthropicLanguageModelsManager = Symbol('AnthropicLanguageModelsManager');
export interface AnthropicModelDescription {
    /**
     * The identifier of the model which will be shown in the UI.
     */
    id: string;
    /**
     * The model ID as used by the Anthropic API.
     */
    model: string;
    /**
     * The key for the model. If 'true' is provided the global Anthropic API key will be used.
     */
    apiKey: string | true | undefined;
    /**
     * Indicate whether the streaming API shall be used.
     */
    enableStreaming: boolean;
    /**
     * Indicate whether the model supports prompt caching.
     */
    useCaching: boolean;
    /**
     * Maximum number of tokens to generate. Default is 4096.
     */
    maxTokens?: number;
    /**
     * Maximum number of retry attempts when a request fails. Default is 3.
     */
    maxRetries: number;

}
export interface AnthropicLanguageModelsManager {
    apiKey: string | undefined;
    setApiKey(key: string | undefined): void;
    createOrUpdateLanguageModels(...models: AnthropicModelDescription[]): Promise<void>;
    removeLanguageModels(...modelIds: string[]): void
}
