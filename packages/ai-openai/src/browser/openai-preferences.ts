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

export const API_KEY_PREF = 'ai-features.openAiOfficial.openAiApiKey';
export const MODELS_PREF = 'ai-features.openAiOfficial.officialOpenAiModels';
export const CUSTOM_ENDPOINTS_PREF = 'ai-features.openAiCustom.customOpenAiModels';

export const OpenAiPreferencesSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        [API_KEY_PREF]: {
            type: 'string',
            markdownDescription: 'Enter an API Key of your official OpenAI Account. **Please note:** By using this preference the Open AI API key will be stored in clear text\
            on the machine running Theia. Use the environment variable `OPENAI_API_KEY` to set the key securely.',
            title: AI_CORE_PREFERENCES_TITLE,
        },
        [MODELS_PREF]: {
            type: 'array',
            description: 'Official OpenAI models to use',
            title: AI_CORE_PREFERENCES_TITLE,
            default: ['gpt-4o', 'gpt-4o-2024-08-06', 'gpt-4o-2024-05-13', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
            items: {
                type: 'string'
            }
        },
        [CUSTOM_ENDPOINTS_PREF]: {
            type: 'array',
            title: AI_CORE_PREFERENCES_TITLE,
            markdownDescription: 'Integrate custom models compatible with the OpenAI API, for example via `vllm`. The required attributes are `model` and `url`.\
            \n\
            Optionally, you can\
            \n\
            - specify a unique `id` to identify the custom model in the UI. If none is given `model` will be used as `id`.\
            \n\
            - provide an `apiKey` to access the API served at the given url. Use `true` to indicate the use of the global OpenAI API key.',
            default: [],
            items: {
                type: 'object',
                properties: {
                    model: {
                        type: 'string',
                        title: 'Model ID'
                    },
                    url: {
                        type: 'string',
                        title: 'The Open AI API compatible endpoint where the model is hosted'
                    },
                    id: {
                        type: 'string',
                        title: 'A unique identifier which is used in the UI to identify the custom model',
                    },
                    apiKey: {
                        type: ['string', 'boolean'],
                        title: 'Either the key to access the API served at the given url or `true` to use the global OpenAI API key',
                    },
                }
            }
        }
    }
};
