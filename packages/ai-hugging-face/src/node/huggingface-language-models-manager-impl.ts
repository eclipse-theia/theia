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

import { LanguageModelRegistry, LanguageModelStatus } from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { HuggingFaceModel } from './huggingface-language-model';
import { HuggingFaceLanguageModelsManager, HuggingFaceModelDescription } from '../common';

@injectable()
export class HuggingFaceLanguageModelsManagerImpl implements HuggingFaceLanguageModelsManager {

    protected _apiKey: string | undefined;

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    get apiKey(): string | undefined {
        return this._apiKey ?? process.env.HUGGINGFACE_API_KEY;
    }

    protected calculateStatus(apiKey: string | undefined): LanguageModelStatus {
        return apiKey ? { status: 'ready' } : { status: 'unavailable', message: 'No Hugging Face API key set' };
    }

    async createOrUpdateLanguageModels(...modelDescriptions: HuggingFaceModelDescription[]): Promise<void> {
        for (const modelDescription of modelDescriptions) {
            const model = await this.languageModelRegistry.getLanguageModel(modelDescription.id);
            const apiKeyProvider = () => this.apiKey;
            const status = this.calculateStatus(this.apiKey);

            if (model) {
                if (!(model instanceof HuggingFaceModel)) {
                    console.warn(`Hugging Face: model ${modelDescription.id} is not a Hugging Face model`);
                    continue;
                }
                model.model = modelDescription.model;
                model.apiKey = apiKeyProvider;
                model.status = status;
            } else {
                this.languageModelRegistry.addLanguageModels([
                    new HuggingFaceModel(
                        modelDescription.id,
                        modelDescription.model,
                        status,
                        apiKeyProvider,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                    )
                ]);
            }
        }
    }

    removeLanguageModels(...modelIds: string[]): void {
        this.languageModelRegistry.removeLanguageModels(modelIds);
    }

    setApiKey(apiKey: string | undefined): void {
        this._apiKey = apiKey || undefined;
    }
}
