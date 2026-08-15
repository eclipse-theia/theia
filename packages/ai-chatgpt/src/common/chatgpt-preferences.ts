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

export const MODELS_PREF = 'ai-features.chatGpt.models';

/**
 * Models offered while the ones available to the account cannot be determined, i.e. before the first sign in or
 * when the endpoint listing them cannot be reached.
 */
export const CHATGPT_FALLBACK_MODELS = [
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'gpt-5.5',
    'gpt-5.5-pro'
];

/**
 * The preference page renders `command:` links of a markdown description through the `CommandOpenHandler`, so
 * the sign in and sign out commands are reachable from the settings as well. Only the link labels are
 * localized: a command id inside a translated string could be broken by a translation.
 */
const MODELS_DESCRIPTION = [
    nls.localize('theia/ai/chatgpt/models/mdDescription',
        'Models to serve through your ChatGPT subscription. They are only available while you are signed in. \
Leave this empty to offer the models your ChatGPT plan actually grants, which are queried once you are signed in.'),
    `[${nls.localize('theia/ai/chatgpt/models/signIn', 'Sign in with ChatGPT')}](command:chatgpt.signIn) \
· [${nls.localizeByDefault('Sign Out')}](command:chatgpt.signOut)`
].join('\n\n');

export const ChatGptPreferencesSchema: PreferenceSchema = {
    properties: {
        [MODELS_PREF]: {
            type: 'array',
            markdownDescription: MODELS_DESCRIPTION,
            title: AI_CORE_PREFERENCES_TITLE,
            default: [],
            items: {
                type: 'string'
            }
        }
    }
};
