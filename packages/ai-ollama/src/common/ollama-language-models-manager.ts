// *****************************************************************************
// Copyright (C) 2024 TypeFox GmbH.
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

import { ReasoningSupport } from '@theia/ai-core';

export const OLLAMA_LANGUAGE_MODELS_MANAGER_PATH = '/services/ollama/language-model-manager';
export const OllamaLanguageModelsManager = Symbol('OllamaLanguageModelsManager');

/**
 * Coarse Ollama reasoning support advertised at registration time. Whether a given Ollama model
 * actually supports thinking is discovered per-request via `ollama.show`; for models without it
 * the selector value is silently ignored.
 */
export const OLLAMA_REASONING_SUPPORT: ReasoningSupport = {
    supportedLevels: ['off', 'minimal', 'low', 'medium', 'high', 'auto'],
    defaultLevel: 'auto'
};

export interface OllamaModelDescription {
    /**
     * The identifier of the model which will be shown in the UI.
     */
    id: string;
    /**
     * The name or ID of the model in the Ollama environment.
     */
    model: string;
    /**
     * When set, the chat exposes a reasoning selector for this model. Defaults to {@link OLLAMA_REASONING_SUPPORT};
     * Ollama checks at request time whether the model supports thinking, so this is safe to leave on for any model.
     */
    reasoningSupport?: ReasoningSupport;
}

export interface OllamaLanguageModelsManager {
    host: string | undefined;
    setHost(host: string | undefined): Promise<void>;
    setProxyUrl(proxyUrl: string | undefined): void;
    createOrUpdateLanguageModels(...models: OllamaModelDescription[]): Promise<void>;
    removeLanguageModels(...modelIds: string[]): void;
}
