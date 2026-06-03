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
import { LINUX_ENV_HINT, nls, PreferenceSchema, PreferenceScope } from '@theia/core';

export const GITHUB_TOKEN_PREF = 'ai-features.registry.githubToken';

export const SkillRegistryPreferencesSchema: PreferenceSchema = {
    scope: PreferenceScope.User,
    properties: {
        [GITHUB_TOKEN_PREF]: {
            type: 'string',
            scope: PreferenceScope.User,
            markdownDescription: nls.localize('theia/ai-registry/skill/githubToken/mdDescription',
                'Optional GitHub personal access token used when downloading skills from GitHub. A token raises GitHub\'s rate limit from 60 to \
5000 requests per hour. **Please note:** By using this preference the token is stored in clear text on the \
machine running Theia. Prefer the environment variable `GITHUB_TOKEN` to provide it securely.') + LINUX_ENV_HINT,
            title: AI_CORE_PREFERENCES_TITLE
        }
    }
};
