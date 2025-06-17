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

export const API_KEY_PREF = 'ai-features.google.apiKey';
export const MODELS_PREF = 'ai-features.google.models';
export const MAX_RETRIES = 'ai-features.google.maxRetriesOnErrors';
export const RETRY_DELAY_RATE_LIMIT = 'ai-features.google.retryDelayOnRateLimitError';
export const RETRY_DELAY_OTHER_ERRORS = 'ai-features.google.retryDelayOnOtherErrors';

export const GooglePreferencesSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        [API_KEY_PREF]: {
            type: 'string',
            markdownDescription: nls.localize('theia/ai/google/apiKey/description',
                'Enter an API Key of your official Google AI (Gemini) Account. **Please note:** By using this preference the GOOGLE AI API key will be stored in clear text\
            on the machine running Theia. Use the environment variable `GOOGLE_API_KEY` to set the key securely.'),
            title: AI_CORE_PREFERENCES_TITLE,
        },
        [MODELS_PREF]: {
            type: 'array',
            description: nls.localize('theia/ai/google/models/description', 'Official Google Gemini models to use'),
            title: AI_CORE_PREFERENCES_TITLE,
            default: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-preview-05-20', 'gemini-2.5-pro-preview-05-06'],
            items: {
                type: 'string'
            }
        },
        [MAX_RETRIES]: {
            type: 'integer',
            description: nls.localize('theia/ai/google/maxRetriesOnErrors/description',
                'Maximum number of retries in case of errors. If smaller than 1, then the retry logic is disabled'),
            title: AI_CORE_PREFERENCES_TITLE,
            default: 3,
            minimum: 0
        },
        [RETRY_DELAY_RATE_LIMIT]: {
            type: 'number',
            description: nls.localize('theia/ai/google/retryDelayOnRateLimitError/description',
                'Delay in seconds between retries in case of rate limit errors. See https://ai.google.dev/gemini-api/docs/rate-limits'),
            title: AI_CORE_PREFERENCES_TITLE,
            default: 60,
            minimum: 0
        },
        [RETRY_DELAY_OTHER_ERRORS]: {
            type: 'number',
            description: nls.localize('theia/ai/google/retryDelayOnOtherErrors/description',
                'Delay in seconds between retries in case of other errors (sometimes the Google GenAI reports errors such as incomplete JSON syntax returned from the model \
                or 500 Internal Server Error). Setting this to -1 prevents retries in these cases. Otherwise a retry happens either immediately (if set to 0) or after \
                this delay in seconds (if set to a positive number).'),
            title: AI_CORE_PREFERENCES_TITLE,
            default: -1,
            minimum: -1
        }
    }
};
