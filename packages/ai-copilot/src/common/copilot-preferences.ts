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

import { AI_CORE_PREFERENCES_TITLE, MODEL_PROVIDER_TYPE_DETAIL, ModelProviderTypeDetail } from '@theia/ai-core/lib/common/ai-core-preferences';
import { nls, PreferenceSchema } from '@theia/core';

export const COPILOT_ENABLED_PREF = 'ai-features.copilot.enabled';
export const COPILOT_MODEL_OVERRIDES_PREF = 'ai-features.copilot.modelOverrides';
export const COPILOT_ENTERPRISE_URL_PREF = 'ai-features.copilot.enterpriseUrl';
export const COPILOT_EXECUTABLE_PATH_PREF = 'ai-features.copilot.executablePath';

export const CopilotPreferencesSchema: PreferenceSchema = {
    properties: {
        [COPILOT_ENABLED_PREF]: {
            type: 'boolean',
            typeDetails: { [MODEL_PROVIDER_TYPE_DETAIL]: { label: 'GitHub Copilot' } satisfies ModelProviderTypeDetail },
            markdownDescription: nls.localize('theia/ai/copilot/enabled/mdDescription',
                'Enable the GitHub Copilot provider. When enabled, a status bar entry '
                + 'appears for authentication and available models are discovered from your Copilot subscription.\n\n'
                + 'Requests are routed through the official GitHub Copilot CLI, which runs as a background process on the '
                + 'machine hosting the backend. It is given the credentials of your Copilot sign-in and nothing else, so a '
                + 'token in the environment or an existing sign-in of the GitHub CLI is not used.'),
            title: AI_CORE_PREFERENCES_TITLE,
            default: true,
            tags: ['experimental']
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
            },
            tags: ['experimental']
        },
        [COPILOT_ENTERPRISE_URL_PREF]: {
            type: 'string',
            markdownDescription: nls.localize('theia/ai/copilot/enterpriseUrl/mdDescription',
                'GitHub Enterprise domain to authenticate and send requests against (e.g., `github.mycompany.com`). '
                + 'Leave empty for GitHub.com.'),
            title: AI_CORE_PREFERENCES_TITLE,
            default: '',
            tags: ['experimental']
        },
        [COPILOT_EXECUTABLE_PATH_PREF]: {
            type: 'string',
            markdownDescription: nls.localize('theia/ai/copilot/executablePath/mdDescription',
                'Location of the GitHub Copilot CLI executable on the machine hosting the backend. '
                + 'When empty (default), the CLI is searched for in the installation of the application, on the `PATH` '
                + 'and in the global `npm` directory. Set this when the CLI is installed somewhere else.\n\n'
                + 'The CLI is not shipped with the application, install it with `npm install -g @github/copilot`.'),
            title: AI_CORE_PREFERENCES_TITLE,
            default: '',
            tags: ['experimental']
        }
    }
};
