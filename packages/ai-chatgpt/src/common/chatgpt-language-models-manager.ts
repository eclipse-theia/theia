// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

export const CHATGPT_LANGUAGE_MODELS_MANAGER_PATH = '/services/chatgpt/language-model-manager';
export const ChatGptLanguageModelsManager = Symbol('ChatGptLanguageModelsManager');

export const CHATGPT_PROVIDER_ID = 'chatgpt';

/**
 * Describes a model served by the ChatGPT subscription. The endpoint, the authentication and the request shape are
 * fixed by the ChatGPT contract, so this carries no endpoint configuration.
 */
export interface ChatGptModelDescription {
    /** The identifier of the model which will be shown in the UI, of the form `chatgpt/<model>`. */
    id: string;
    /** The model ID as used by the ChatGPT endpoint. */
    model: string;
    /** Maximum number of retry attempts when a request fails. */
    maxRetries: number;
}

export interface ChatGptLanguageModelsManager {
    setProxyUrl(proxyUrl: string | undefined): void;
    /**
     * The models the signed in ChatGPT plan grants. Falls back to a built-in list while they cannot be determined,
     * i.e. before the first sign in or when the endpoint listing them cannot be reached.
     */
    getAvailableModels(): Promise<string[]>;
    createOrUpdateLanguageModels(...models: ChatGptModelDescription[]): Promise<void>;
    removeLanguageModels(...modelIds: string[]): void;
}
