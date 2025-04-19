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
            default: ['gemini-2.0-flash', 'gemini-2.5-flash-preview-04-17', 'gemini-2.5-pro-exp-03-25', 'gemini-2.0-pro-exp-02-05'],
            items: {
                type: 'string'
            }
        },
    }
};
