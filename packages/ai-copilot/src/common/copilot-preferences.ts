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

export const COPILOT_ENABLED_PREF = 'ai-features.copilot.enabled';
export const COPILOT_MODEL_OVERRIDES_PREF = 'ai-features.copilot.modelOverrides';
export const COPILOT_ENTERPRISE_URL_PREF = 'ai-features.copilot.enterpriseUrl';

export const CopilotPreferencesSchema: PreferenceSchema = {
    properties: {
        [COPILOT_ENABLED_PREF]: {
            type: 'boolean',
            markdownDescription: nls.localize('theia/ai/copilot/enabled/mdDescription',
                'Enable the GitHub Copilot provider. When enabled, a status bar entry '
                + 'appears for authentication and available models are discovered from your Copilot subscription.'),
            title: AI_CORE_PREFERENCES_TITLE,
            default: true
        },
        [COPILOT_MODEL_OVERRIDES_PREF]: {
            type: 'array',
            markdownDescription: nls.localize('theia/ai/copilot/modelOverrides/mdDescription',
                'Override the automatically discovered GitHub Copilot models. '
                + 'When empty (default), available models are discovered from your Copilot subscription. '
                + 'Set explicit model IDs to override auto-discovery.'),
            title: AI_CORE_PREFERENCES_TITLE,
            default: [],
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
