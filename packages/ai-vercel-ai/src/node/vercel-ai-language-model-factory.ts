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

import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { LanguageModelV1 } from '@ai-sdk/provider';
import { injectable } from '@theia/core/shared/inversify';
import { VercelAiModelDescription } from '../common';

export type VercelAiProvider = 'openai' | 'anthropic';

export interface VercelAiProviderConfig {
    provider: VercelAiProvider;
    apiKey?: string;
    baseURL?: string;
}

@injectable()
export class VercelAiLanguageModelFactory {

    createLanguageModel(modelDescription: VercelAiModelDescription, providerConfig: VercelAiProviderConfig): LanguageModelV1 {
        const apiKey = this.resolveApiKey(modelDescription, providerConfig);
        if (!apiKey) {
            throw new Error(`Please provide an API key for ${providerConfig.provider} in preferences or via environment variable`);
        }

        const baseURL = modelDescription.url || providerConfig.baseURL;

        switch (providerConfig.provider) {
            case 'openai':
                return createOpenAI({
                    apiKey,
                    baseURL,
                    compatibility: 'strict'
                }).languageModel(modelDescription.model);
            case 'anthropic':
                return createAnthropic({
                    apiKey,
                    baseURL
                }).languageModel(modelDescription.model);
            default:
                throw new Error(`Unsupported provider: ${providerConfig.provider}`);
        }
    }

    private resolveApiKey(modelDescription: VercelAiModelDescription, providerConfig: VercelAiProviderConfig): string | undefined {
        if (modelDescription.apiKey === true) {
            return this.getApiKeyBasedOnProvider(providerConfig);
        }
        if (modelDescription.apiKey) {
            return modelDescription.apiKey;
        }
        return this.getApiKeyBasedOnProvider(providerConfig);
    }

    private getApiKeyBasedOnProvider(providerConfig: VercelAiProviderConfig): string | undefined {
        if (providerConfig.apiKey) {
            return providerConfig.apiKey;
        }
        switch (providerConfig.provider) {
            case 'openai':
                return process.env.OPENAI_API_KEY;
            case 'anthropic':
                return process.env.ANTHROPIC_API_KEY;
            default:
                return undefined;
        }
    }
}
