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

import { PreferenceSchema } from '@theia/core/lib/browser/preferences/preference-contribution';
import { AI_CORE_PREFERENCES_TITLE } from '@theia/ai-core/lib/browser/ai-core-preferences';
import { nls } from '@theia/core';

export const OPENAI_API_KEY_PREF = 'ai-features.vercelAi.openaiApiKey';
export const ANTHROPIC_API_KEY_PREF = 'ai-features.vercelAi.anthropicApiKey';
export const MODELS_PREF = 'ai-features.vercelAi.officialModels';
export const CUSTOM_ENDPOINTS_PREF = 'ai-features.vercelAi.customModels';

export const VERCEL_AI_PROVIDER_ID = 'vercel-ai';

export const VercelAiPreferencesSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        [OPENAI_API_KEY_PREF]: {
            type: 'string',
            markdownDescription: nls.localize('theia/ai/vercelai/openaiApiKey/mdDescription',
                'Enter an API Key for OpenAI models used by the Vercel AI SDK. \
                **Please note:** By using this preference the API key will be stored in clear text \
on the machine running Theia. Use the environment variable `OPENAI_API_KEY` to set the key securely.'),
            title: AI_CORE_PREFERENCES_TITLE,
        },
        [ANTHROPIC_API_KEY_PREF]: {
            type: 'string',
            markdownDescription: nls.localize('theia/ai/vercelai/anthropicApiKey/mdDescription',
                'Enter an API Key for Anthropic models used by the Vercel AI SDK. \
                **Please note:** By using this preference the API key will be stored in clear text \
on the machine running Theia. Use the environment variable `ANTHROPIC_API_KEY` to set the key securely.'),
            title: AI_CORE_PREFERENCES_TITLE,
        },
        [MODELS_PREF]: {
            type: 'array',
            description: nls.localize('theia/ai/vercelai/models/description', 'Official models to use with Vercel AI SDK'),
            title: AI_CORE_PREFERENCES_TITLE,
            default: [
                { id: 'vercel/openai/gpt-4.1', model: 'gpt-4.1', provider: 'openai' },
                { id: 'vercel/openai/gpt-4.1-nano', model: 'gpt-4.1-nano', provider: 'openai' },
                { id: 'vercel/openai/gpt-4.1-mini', model: 'gpt-4.1-mini', provider: 'openai' },
                { id: 'vercel/openai/gpt-4-turbo', model: 'gpt-4-turbo', provider: 'openai' },
                { id: 'vercel/openai/gpt-4o', model: 'gpt-4o', provider: 'openai' },
                { id: 'vercel/openai/gpt-4o-mini', model: 'gpt-4o-mini', provider: 'openai' },
                { id: 'vercel/anthropic/claude-3-7-sonnet-20250219', model: 'claude-3-7-sonnet-20250219', provider: 'anthropic' },
                { id: 'vercel/anthropic/claude-3-5-haiku-20241022', model: 'claude-3-5-haiku-20241022', provider: 'anthropic' },
                { id: 'vercel/anthropic/claude-3-opus-20240229', model: 'claude-3-opus-20240229', provider: 'anthropic' }
            ],
            items: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        title: nls.localize('theia/ai/vercelai/models/id/title', 'Model ID')
                    },
                    model: {
                        type: 'string',
                        title: nls.localize('theia/ai/vercelai/models/model/title', 'Model Name')
                    },
                    provider: {
                        type: 'string',
                        enum: ['openai', 'anthropic'],
                        title: nls.localize('theia/ai/vercelai/models/provider/title', 'Provider')
                    }
                },
                required: ['id', 'model', 'provider']
            }
        },
        [CUSTOM_ENDPOINTS_PREF]: {
            type: 'array',
            title: AI_CORE_PREFERENCES_TITLE,
            markdownDescription: nls.localize('theia/ai/vercelai/customEndpoints/mdDescription',
                'Integrate custom models compatible with the Vercel AI SDK. The required attributes are `model` and `url`.\
            \n\
            Optionally, you can\
            \n\
            - specify a unique `id` to identify the custom model in the UI. If none is given `model` will be used as `id`.\
            \n\
            - provide an `apiKey` to access the API served at the given url. Use `true` to indicate the use of the global API key.\
            \n\
            - specify `supportsStructuredOutput: false` to indicate that structured output shall not be used.\
            \n\
            - specify `enableStreaming: false` to indicate that streaming shall not be used.\
            \n\
            - specify `provider` to indicate which provider the model is from (openai, anthropic).'),
            default: [],
            items: {
                type: 'object',
                properties: {
                    model: {
                        type: 'string',
                        title: nls.localize('theia/ai/vercelai/customEndpoints/modelId/title', 'Model ID')
                    },
                    url: {
                        type: 'string',
                        title: nls.localize('theia/ai/vercelai/customEndpoints/url/title', 'The API endpoint where the model is hosted')
                    },
                    id: {
                        type: 'string',
                        title: nls.localize('theia/ai/vercelai/customEndpoints/id/title', 'A unique identifier which is used in the UI to identify the custom model'),
                    },
                    provider: {
                        type: 'string',
                        enum: ['openai', 'anthropic'],
                        title: nls.localize('theia/ai/vercelai/customEndpoints/provider/title', 'Provider')
                    },
                    apiKey: {
                        type: ['string', 'boolean'],
                        title: nls.localize('theia/ai/vercelai/customEndpoints/apiKey/title',
                            'Either the key to access the API served at the given url or `true` to use the global API key'),
                    },
                    supportsStructuredOutput: {
                        type: 'boolean',
                        title: nls.localize('theia/ai/vercelai/customEndpoints/supportsStructuredOutput/title',
                            'Indicates whether the model supports structured output. `true` by default.'),
                    },
                    enableStreaming: {
                        type: 'boolean',
                        title: nls.localize('theia/ai/vercelai/customEndpoints/enableStreaming/title',
                            'Indicates whether the streaming API shall be used. `true` by default.'),
                    }
                }
            }
        }
    }
};
