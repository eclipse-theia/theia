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

export const HUGGINGFACE_LANGUAGE_MODELS_MANAGER_PATH = '/services/huggingface/language-model-manager';
export const HuggingFaceLanguageModelsManager = Symbol('HuggingFaceLanguageModelsManager');

export interface HuggingFaceModelDescription {
    /**
     * The identifier of the model which will be shown in the UI.
     */
    id: string;
    /**
     * The model ID as used by the Hugging Face API.
     */
    model: string;
    /**
     * Default request settings for the Hugging Face model.
     */
    defaultRequestSettings?: { [key: string]: unknown };
}

export interface HuggingFaceLanguageModelsManager {
    apiKey: string | undefined;
    setApiKey(key: string | undefined): void;
    createOrUpdateLanguageModels(...models: HuggingFaceModelDescription[]): Promise<void>;
    removeLanguageModels(...modelIds: string[]): void;
}
