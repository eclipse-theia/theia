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

import { LanguageModelRegistry, TokenUsageService } from '@theia/ai-core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { VercelAiModel } from './vercel-ai-language-model';
import { VercelAiLanguageModelsManager, VercelAiModelDescription } from '../common';
import { ILogger } from '@theia/core';
import { VercelAiLanguageModelFactory, VercelAiProvider, VercelAiProviderConfig } from './vercel-ai-language-model-factory';

@injectable()
export class VercelAiLanguageModelsManagerImpl implements VercelAiLanguageModelsManager {

    apiKey: string | undefined;
    protected providerConfigs: Map<VercelAiProvider, VercelAiProviderConfig> = new Map();

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    @inject(TokenUsageService)
    protected readonly tokenUsageService: TokenUsageService;

    @inject(ILogger) @named('vercel-ai')
    protected readonly logger: ILogger;

    @inject(VercelAiLanguageModelFactory)
    protected readonly languageModelFactory: VercelAiLanguageModelFactory;

    // Triggered from frontend. In case you want to use the models on the backend
    // without a frontend then call this yourself
    async createOrUpdateLanguageModels(...modelDescriptions: VercelAiModelDescription[]): Promise<void> {
        for (const modelDescription of modelDescriptions) {
            this.logger.info(`Vercel AI: Creating or updating model ${modelDescription.id}`);
            const model = await this.languageModelRegistry.getLanguageModel(modelDescription.id);
            const provider = this.determineProvider(modelDescription);
            const providerConfig = this.getProviderConfig(provider);

            if (model) {
                if (!(model instanceof VercelAiModel)) {
                    this.logger.warn(`Vercel AI: model ${modelDescription.id} is not a Vercel AI model`);
                    continue;
                }
                model.model = modelDescription.model;
                model.enableStreaming = modelDescription.enableStreaming;
                model.url = modelDescription.url;
                model.supportsStructuredOutput = modelDescription.supportsStructuredOutput;
                model.maxRetries = modelDescription.maxRetries;
                this.providerConfigs.set(provider, providerConfig);
            } else {
                this.languageModelRegistry.addLanguageModels([
                    new VercelAiModel(
                        modelDescription.id,
                        modelDescription.model,
                        modelDescription.enableStreaming,
                        modelDescription.supportsStructuredOutput,
                        modelDescription.url,
                        this.logger,
                        this.languageModelFactory,
                        () => this.getProviderConfig(provider),
                        modelDescription.maxRetries,
                        this.tokenUsageService
                    )
                ]);
            }
        }
    }

    removeLanguageModels(...modelIds: string[]): void {
        this.languageModelRegistry.removeLanguageModels(modelIds);
    }

    setProviderConfig(provider: VercelAiProvider, config: Partial<VercelAiProviderConfig>): void {
        const existingConfig = this.providerConfigs.get(provider) || { provider };
        this.providerConfigs.set(provider, { ...existingConfig, ...config });
    }

    private determineProvider(modelDescription: VercelAiModelDescription): VercelAiProvider {
        // Use the provider from the model description or default to OpenAI
        return modelDescription.provider || 'openai';
    }

    private getProviderConfig(provider: VercelAiProvider): VercelAiProviderConfig {
        let config = this.providerConfigs.get(provider);
        if (!config) {
            config = { provider, apiKey: this.apiKey };
            this.providerConfigs.set(provider, config);
        }
        return config;
    }
}
