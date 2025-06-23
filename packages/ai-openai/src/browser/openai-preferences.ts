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

import { PreferenceSchema } from '@theia/core/lib/browser/preferences/preference-contribution';
import { AI_CORE_PREFERENCES_TITLE } from '@theia/ai-core/lib/browser/ai-core-preferences';
import { nls } from '@theia/core';

export const API_KEY_PREF = 'ai-features.openAiOfficial.openAiApiKey';
export const MODELS_PREF = 'ai-features.openAiOfficial.officialOpenAiModels';
export const CUSTOM_ENDPOINTS_PREF = 'ai-features.openAiCustom.customOpenAiModels';

export const OpenAiPreferencesSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        [API_KEY_PREF]: {
            type: 'string',
            markdownDescription: nls.localize('theia/ai/openai/apiKey/mdDescription',
                'Enter an API Key of your official OpenAI Account. **Please note:** By using this preference the Open AI API key will be stored in clear text \
on the machine running Theia. Use the environment variable `OPENAI_API_KEY` to set the key securely.'),
            title: AI_CORE_PREFERENCES_TITLE,
        },
        [MODELS_PREF]: {
            type: 'array',
            description: nls.localize('theia/ai/openai/models/description', 'Official OpenAI models to use'),
            title: AI_CORE_PREFERENCES_TITLE,
            default: [
                'gpt-4o',
                'gpt-4.1',
                'gpt-4.1-nano',
                'gpt-4.1-mini',
                'gpt-4o-2024-11-20',
                'gpt-4o-2024-08-06',
                'gpt-4o-mini',
                'o3',
                'o3-mini',
                'o4-mini',
                'o4-mini-high',
                'gpt-4.5-preview'
            ],
            items: {
                type: 'string'
            }
        },
        [CUSTOM_ENDPOINTS_PREF]: {
            type: 'array',
            title: AI_CORE_PREFERENCES_TITLE,
            markdownDescription: nls.localize('theia/ai/openai/customEndpoints/mdDescription',
                'Integrate custom models compatible with the OpenAI API, for example via `vllm`. The required attributes are `model` and `url`.\
            \n\
            Optionally, you can\
            \n\
            - specify a unique `id` to identify the custom model in the UI. If none is given `model` will be used as `id`.\
            \n\
            - provide an `apiKey` to access the API served at the given url. Use `true` to indicate the use of the global OpenAI API key.\
            \n\
            - provide an `apiVersion` to access the API served at the given url in Azure. Use `true` to indicate the use of the global OpenAI API version.\
            \n\
            - set `developerMessageSettings` to one of `user`, `system`, `developer`, `mergeWithFollowingUserMessage`, or `skip` to control how the developer message is\
            included (where `user`, `system`, and `developer` will be used as a role, `mergeWithFollowingUserMessage` will prefix the following user message with the system\
            message or convert the system message to user message if the next message is not a user message. `skip` will just remove the system message).\
            Defaulting to `developer`.\
            \n\
            - specify `supportsStructuredOutput: false` to indicate that structured output shall not be used.\
            \n\
            - specify `enableStreaming: false` to indicate that streaming shall not be used.\
            \n\
            Refer to [our documentation](https://theia-ide.org/docs/user_ai/#openai-compatible-models-eg-via-vllm) for more information.'),
            default: [],
            items: {
                type: 'object',
                properties: {
                    model: {
                        type: 'string',
                        title: nls.localize('theia/ai/openai/customEndpoints/modelId/title', 'Model ID')
                    },
                    url: {
                        type: 'string',
                        title: nls.localize('theia/ai/openai/customEndpoints/url/title', 'The Open AI API compatible endpoint where the model is hosted')
                    },
                    id: {
                        type: 'string',
                        title: nls.localize('theia/ai/openai/customEndpoints/id/title', 'A unique identifier which is used in the UI to identify the custom model'),
                    },
                    apiKey: {
                        type: ['string', 'boolean'],
                        title: nls.localize('theia/ai/openai/customEndpoints/apiKey/title',
                            'Either the key to access the API served at the given url or `true` to use the global OpenAI API key'),
                    },
                    apiVersion: {
                        type: ['string', 'boolean'],
                        title: nls.localize('theia/ai/openai/customEndpoints/apiVersion/title',
                            'Either the version to access the API served at the given url in Azure or `true` to use the global OpenAI API version'),
                    },
                    developerMessageSettings: {
                        type: 'string',
                        enum: ['user', 'system', 'developer', 'mergeWithFollowingUserMessage', 'skip'],
                        default: 'developer',
                        title: nls.localize('theia/ai/openai/customEndpoints/developerMessageSettings/title',
                            'Controls the handling of system messages: `user`, `system`, and `developer` will be used as a role, `mergeWithFollowingUserMessage` will prefix\
                         the following user message with the system message or convert the system message to user message if the next message is not a user message.\
                         `skip` will just remove the system message), defaulting to `developer`.')
                    },
                    supportsStructuredOutput: {
                        type: 'boolean',
                        title: nls.localize('theia/ai/openai/customEndpoints/supportsStructuredOutput/title',
                            'Indicates whether the model supports structured output. `true` by default.'),
                    },
                    enableStreaming: {
                        type: 'boolean',
                        title: nls.localize('theia/ai/openai/customEndpoints/enableStreaming/title',
                            'Indicates whether the streaming API shall be used. `true` by default.'),
                    }
                }
            }
        }
    }
};
