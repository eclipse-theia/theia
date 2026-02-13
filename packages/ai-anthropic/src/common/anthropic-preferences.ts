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

import { AI_CORE_PREFERENCES_TITLE } from '@theia/ai-core/lib/common/ai-core-preferences';
import { nls, PreferenceSchema } from '@theia/core';

export const API_KEY_PREF = 'ai-features.anthropic.AnthropicApiKey';
export const MODELS_PREF = 'ai-features.anthropic.AnthropicModels';
export const CUSTOM_ENDPOINTS_PREF = 'ai-features.anthropicCustom.customAnthropicModels';

export const AnthropicPreferencesSchema: PreferenceSchema = {
    properties: {
        [API_KEY_PREF]: {
            type: 'string',
            markdownDescription: nls.localize('theia/ai/anthropic/apiKey/description',
                'Enter an API Key of your official Anthropic Account. **Please note:** By using this preference the Anthropic API key will be stored in clear text\
            on the machine running Theia. Use the environment variable `ANTHROPIC_API_KEY` to set the key securely.'),
            title: AI_CORE_PREFERENCES_TITLE,
        },
        [MODELS_PREF]: {
            type: 'array',
            description: nls.localize('theia/ai/anthropic/models/description', 'Official Anthropic models to use'),
            title: AI_CORE_PREFERENCES_TITLE,
            default: ['claude-sonnet-4-5', 'claude-sonnet-4-0', 'claude-3-7-sonnet-latest', 'claude-opus-4-5', 'claude-opus-4-1'],
            items: {
                type: 'string'
            }
        },
        [CUSTOM_ENDPOINTS_PREF]: {
            type: 'array',
            title: AI_CORE_PREFERENCES_TITLE,
            markdownDescription: nls.localize('theia/ai/anthropic/customEndpoints/mdDescription',
                'Integrate custom models compatible with the Anthropic API. The required attributes are `model` and `url`.\
            \n\
            Optionally, you can\
            \n\
            - specify a unique `id` to identify the custom model in the UI. If none is given `model` will be used as `id`.\
            \n\
            - provide an `apiKey` to access the API served at the given url. Use `true` to indicate the use of the global anthropic API key.\
            \n\
            - specify `enableStreaming: false` to indicate that streaming shall not be used.\
            \n\
            - specify `useCaching: false` to indicate that prompt caching shall not be used.\
            \n\
            - specify `maxRetries: <number>` to indicate the maximum number of retries when a request fails. 3 by default.'),
            default: [],
            items: {
                type: 'object',
                properties: {
                    model: {
                        type: 'string',
                        title: nls.localize('theia/ai/anthropic/customEndpoints/modelId/title', 'Model ID')
                    },
                    url: {
                        type: 'string',
                        title: nls.localize('theia/ai/anthropic/customEndpoints/url/title', 'The Anthropic API compatible endpoint where the model is hosted')
                    },
                    id: {
                        type: 'string',
                        title: nls.localize('theia/ai/anthropic/customEndpoints/id/title', 'A unique identifier which is used in the UI to identify the custom model'),
                    },
                    apiKey: {
                        type: ['string', 'boolean'],
                        title: nls.localize('theia/ai/anthropic/customEndpoints/apiKey/title',
                            'Either the key to access the API served at the given url or `true` to use the global Anthropic API key'),
                    },
                    enableStreaming: {
                        type: 'boolean',
                        title: nls.localize('theia/ai/anthropic/customEndpoints/enableStreaming/title',
                            'Indicates whether the streaming API shall be used. `true` by default.'),
                    },
                    useCaching: {
                        type: 'boolean',
                        title: nls.localize('theia/ai/anthropic/customEndpoints/useCaching/title',
                            'Indicates whether the model supports prompt caching. `true` by default'),
                    },
                    maxRetries: {
                        type: 'number',
                        title: nls.localize('theia/ai/anthropic/customEndpoints/maxRetries/title',
                            'Maximum number of retries when a request fails. 3 by default'),
                    }
                }
            }
        }
    }
};
