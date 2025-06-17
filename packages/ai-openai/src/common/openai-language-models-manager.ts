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
export const OPENAI_LANGUAGE_MODELS_MANAGER_PATH = '/services/open-ai/language-model-manager';
export const OpenAiLanguageModelsManager = Symbol('OpenAiLanguageModelsManager');

export const OPENAI_PROVIDER_ID = 'openai';

export interface OpenAiModelDescription {
    /**
     * The identifier of the model which will be shown in the UI.
     */
    id: string;
    /**
     * The model ID as used by the OpenAI API.
     */
    model: string;
    /**
     * The OpenAI API compatible endpoint where the model is hosted. If not provided the default OpenAI endpoint will be used.
     */
    url?: string;
    /**
     * The key for the model. If 'true' is provided the global OpenAI API key will be used.
     */
    apiKey: string | true | undefined;
    /**
     * The version for the api. If 'true' is provided the global OpenAI version will be used.
     */
    apiVersion: string | true | undefined;
    /**
     * Indicate whether the streaming API shall be used.
     */
    enableStreaming: boolean;
    /**
     * Property to configure the developer message of the model. Setting this property to 'user', 'system', or 'developer' will use that string as the role for the system message.
     * Setting it to 'mergeWithFollowingUserMessage' will prefix the following user message with the system message or convert the system message to user if the following message
     * is not a user message. 'skip' will remove the system message altogether.
     * Defaults to 'developer'.
     */
    developerMessageSettings?: 'user' | 'system' | 'developer' | 'mergeWithFollowingUserMessage' | 'skip';
    /**
     * Flag to configure whether the OpenAPI model supports structured output. Default is `true`.
     */
    supportsStructuredOutput: boolean;
    /**
     * Maximum number of retry attempts when a request fails. Default is 3.
     */
    maxRetries: number;
}
export interface OpenAiLanguageModelsManager {
    apiKey: string | undefined;
    setApiKey(key: string | undefined): void;
    setApiVersion(version: string | undefined): void;
    createOrUpdateLanguageModels(...models: OpenAiModelDescription[]): Promise<void>;
    removeLanguageModels(...modelIds: string[]): void
}
