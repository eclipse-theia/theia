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

export const API_KEY_PREF = 'ai-features.anthropic.AnthropicApiKey';
export const MODELS_PREF = 'ai-features.anthropic.AnthropicModels';

export const AnthropicPreferencesSchema: PreferenceSchema = {
    type: 'object',
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
            default: ['claude-3-7-sonnet-latest', 'claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest', 'claude-opus-4-20250514',
                 'claude-sonnet-4-20250514'],
            items: {
                type: 'string'
            }
        },
    }
};
