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

import { LanguageModelRegistry, LanguageModelStatus } from '@theia/ai-core';
import { getProxyUrl } from '@theia/ai-core/lib/node';
import { nls } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { OpenAiModelUtils } from '@theia/ai-openai/lib/node/openai-language-model';
import { getOpenAiModelDefaults } from '@theia/ai-openai/lib/node/openai-model-defaults';
import { CHATGPT_RESPONSES_BASE_URL, ChatGptLanguageModelsManager, ChatGptModelDescription } from '../common';
import { ChatGptAuthServiceImpl } from './chatgpt-auth-service-impl';
import { ChatGptModel } from './chatgpt-language-model';
import { ChatGptModelCatalog } from './chatgpt-model-catalog';
import { ChatGptResponseApiUtils } from './chatgpt-response-api-utils';

@injectable()
export class ChatGptLanguageModelsManagerImpl implements ChatGptLanguageModelsManager {

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    @inject(ChatGptAuthServiceImpl)
    protected readonly authService: ChatGptAuthServiceImpl;

    @inject(ChatGptResponseApiUtils)
    protected readonly responseApiUtils: ChatGptResponseApiUtils;

    @inject(OpenAiModelUtils)
    protected readonly modelUtils: OpenAiModelUtils;

    @inject(ChatGptModelCatalog)
    protected readonly modelCatalog: ChatGptModelCatalog;

    protected proxyUrl: string | undefined;

    setProxyUrl(proxyUrl: string | undefined): void {
        this.proxyUrl = proxyUrl || undefined;
    }

    getAvailableModels(): Promise<string[]> {
        return this.modelCatalog.getAvailableModels();
    }

    async createOrUpdateLanguageModels(...modelDescriptions: ChatGptModelDescription[]): Promise<void> {
        const status = await this.calculateStatus();
        const proxy = getProxyUrl(CHATGPT_RESPONSES_BASE_URL, this.proxyUrl);
        for (const description of modelDescriptions) {
            // The ChatGPT plan serves OpenAI models, so their published capabilities apply.
            const defaults = getOpenAiModelDefaults(description.model);
            const existing = await this.languageModelRegistry.getLanguageModel(description.id);
            if (existing) {
                if (!(existing instanceof ChatGptModel)) {
                    console.warn(`ChatGPT: model ${description.id} is not a ChatGPT model`);
                    continue;
                }
                await this.languageModelRegistry.patchLanguageModel<ChatGptModel>(description.id, {
                    model: description.model,
                    status,
                    maxRetries: description.maxRetries,
                    proxy,
                    reasoningSupport: defaults.reasoningSupport,
                    maxInputTokens: defaults.contextWindow
                });
            } else {
                this.languageModelRegistry.addLanguageModels([
                    new ChatGptModel(
                        description.id,
                        description.model,
                        status,
                        () => this.authService.getCredentials(),
                        this.responseApiUtils,
                        this.modelUtils,
                        description.maxRetries,
                        proxy,
                        defaults.reasoningSupport,
                        defaults.contextWindow
                    )
                ]);
            }
        }
    }

    protected async calculateStatus(): Promise<LanguageModelStatus> {
        return (await this.authService.getAuthState()).isAuthenticated
            ? { status: 'ready' }
            : { status: 'unavailable', message: nls.localize('theia/ai/chatgpt/notSignedIn', 'Not signed in with ChatGPT') };
    }

    removeLanguageModels(...modelIds: string[]): void {
        this.languageModelRegistry.removeLanguageModels(modelIds);
    }
}
