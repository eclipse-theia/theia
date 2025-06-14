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

import { LanguageModelRegistry, TokenUsageService } from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { OllamaModel } from './ollama-language-model';
import { OllamaLanguageModelsManager, OllamaModelDescription } from '../common';

@injectable()
export class OllamaLanguageModelsManagerImpl implements OllamaLanguageModelsManager {

    protected _host: string | undefined;

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    @inject(TokenUsageService)
    protected readonly tokenUsageService: TokenUsageService;

    get host(): string | undefined {
        return this._host ?? process.env.OLLAMA_HOST;
    }

    // Triggered from frontend. In case you want to use the models on the backend
    // without a frontend then call this yourself
    async createOrUpdateLanguageModels(...models: OllamaModelDescription[]): Promise<void> {
        for (const modelDescription of models) {
            const existingModel = await this.languageModelRegistry.getLanguageModel(modelDescription.id);
            const hostProvider = () => this.host;

            if (existingModel) {
                if (!(existingModel instanceof OllamaModel)) {
                    console.warn(`Ollama: model ${modelDescription.id} is not an Ollama model`);
                    continue;
                }
            } else {
                this.languageModelRegistry.addLanguageModels([
                    new OllamaModel(
                        modelDescription.id,
                        modelDescription.model,
                        hostProvider,
                        this.tokenUsageService
                    )
                ]);
            }
        }
    }

    removeLanguageModels(...modelIds: string[]): void {
        this.languageModelRegistry.removeLanguageModels(modelIds.map(id => `ollama/${id}`));
    }

    setHost(host: string | undefined): void {
        this._host = host || undefined;
    }
}
