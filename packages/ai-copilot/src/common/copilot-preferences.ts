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

import { AI_CORE_PREFERENCES_TITLE } from '@theia/ai-core/lib/common/ai-core-preferences';
import { nls, PreferenceSchema } from '@theia/core';

export const COPILOT_MODELS_PREF = 'ai-features.copilot.models';
export const COPILOT_ENTERPRISE_URL_PREF = 'ai-features.copilot.enterpriseUrl';

export const CopilotPreferencesSchema: PreferenceSchema = {
    properties: {
        [COPILOT_MODELS_PREF]: {
            type: 'array',
            description: nls.localize('theia/ai/copilot/models/description',
                'GitHub Copilot models to use. Available models depend on your Copilot subscription.'),
            title: AI_CORE_PREFERENCES_TITLE,
            // https://models.dev/?search=copilot
            default: [
                'claude-haiku-4.5',
                'claude-sonnet-4.5',
                'claude-opus-4.5',
                'gemini-2.5-pro',
                'gpt-4.1',
                'gpt-4o',
                'gpt-5-mini',
                'gpt-5.2',
            ],
            items: {
                type: 'string'
            }
        },
        [COPILOT_ENTERPRISE_URL_PREF]: {
            type: 'string',
            markdownDescription: nls.localize('theia/ai/copilot/enterpriseUrl/mdDescription',
                'GitHub Enterprise domain for Copilot API (e.g., `github.mycompany.com`). Leave empty for GitHub.com.'),
            title: AI_CORE_PREFERENCES_TITLE,
            default: ''
        }
    }
};
