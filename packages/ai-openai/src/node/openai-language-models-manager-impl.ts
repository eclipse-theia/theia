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

import { LanguageModelRegistry } from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { OpenAiModel } from './openai-language-model';
import { OpenAiLanguageModelsManager, OpenAiModelDescription } from '../common';

@injectable()
export class OpenAiLanguageModelsManagerImpl implements OpenAiLanguageModelsManager {

    protected _apiKey: string | undefined;

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    get apiKey(): string | undefined {
        return this._apiKey ?? process.env.OPENAI_API_KEY;
    }

    // Triggered from frontend. In case you want to use the models on the backend
    // without a frontend then call this yourself
    async createOrUpdateLanguageModels(...modelDescriptions: OpenAiModelDescription[]): Promise<void> {
        for (const modelDescription of modelDescriptions) {
            const model = await this.languageModelRegistry.getLanguageModel(modelDescription.id);
            if (model) {
                if (!(model instanceof OpenAiModel)) {
                    console.warn(`Open AI: model ${modelDescription.id} is not an OpenAI model`);
                    continue;
                }
                if (!modelDescription.url) {
                    // This seems to be an official model, but it was already created. This can happen during the initializing of more than one frontend.
                    console.info(`Open AI: skip creating model ${modelDescription.id} because it already exists`);
                    continue;
                }
                if (model.url !== modelDescription.url || model.model !== modelDescription.model) {
                    model.url = modelDescription.url;
                    model.model = modelDescription.model;
                } else {
                    // This can happen during the initializing of more than one frontends.
                    console.info(`Open AI: skip creating or updating model ${modelDescription.id} because it already exists and is up to date`);
                }
            } else {
                this.languageModelRegistry.addLanguageModels([new OpenAiModel(modelDescription.id, modelDescription.model, () => this.apiKey, modelDescription.url)]);
            }
        }
    }

    removeLanguageModels(...modelIds: string[]): void {
        this.languageModelRegistry.removeLanguageModels(modelIds);
    }

    setApiKey(apiKey: string | undefined): void {
        if (apiKey) {
            this._apiKey = apiKey;
        } else {
            this._apiKey = undefined;
        }
    }
}
