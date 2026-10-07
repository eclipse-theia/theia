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

import {
    AI_CORE_PREFERENCES_TITLE, MODEL_PROVIDER_TYPE_DETAIL, ModelProviderTypeDetail, PREFERENCE_NAME_SERVER_SIDE_COMPACTION
} from '@theia/ai-core/lib/common/ai-core-preferences';
import { SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD_MINIMUM } from '@theia/ai-core/lib/common/language-model';
import { nls, PreferenceSchema } from '@theia/core';

export const CHATGPT_ENABLED_PREF = 'ai-features.chatGpt.enabled';
export const MODELS_PREF = 'ai-features.chatGpt.modelOverrides';
export const SERVER_SIDE_COMPACTION_PREF = 'ai-features.chatGpt.serverSideCompaction';
export const SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD_PREF = 'ai-features.chatGpt.serverSideCompactionTokenThreshold';

/**
 * Models offered when discovery for an authenticated account fails.
 */
export const CHATGPT_FALLBACK_MODELS = [
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'gpt-5.5',
    'gpt-5.5-pro'
];

const MODELS_DESCRIPTION = nls.localize('theia/ai/chatgpt/models/mdDescription',
    'Models to serve through your ChatGPT subscription. They are only available while you are signed in. \
Leave this empty to offer the models your ChatGPT plan actually grants, which are queried once you are signed in.');

export const ChatGptPreferencesSchema: PreferenceSchema = {
    properties: {
        [CHATGPT_ENABLED_PREF]: {
            type: 'boolean',
            typeDetails: { [MODEL_PROVIDER_TYPE_DETAIL]: { label: 'ChatGPT' } satisfies ModelProviderTypeDetail },
            markdownDescription: nls.localize('theia/ai/chatgpt/enabled/mdDescription',
                'Enable the ChatGPT provider. When enabled, a status bar entry appears for authentication '
                + 'and available models are discovered from your ChatGPT subscription.'),
            tags: ['experimental'],
            title: AI_CORE_PREFERENCES_TITLE,
            default: true
        },
        [SERVER_SIDE_COMPACTION_PREF]: {
            type: 'string',
            enum: ['default', 'enabled', 'disabled'],
            enumDescriptions: [
                nls.localize('theia/ai/chatgpt/compaction/default', 'Follow the global chat server-side compaction setting.'),
                nls.localize('theia/ai/chatgpt/compaction/enabled', 'Always request server-side compaction for ChatGPT models.'),
                nls.localize('theia/ai/chatgpt/compaction/disabled', 'Never request server-side compaction for ChatGPT models.')
            ],
            default: 'default',
            markdownDescription: nls.localize('theia/ai/chatgpt/compaction/description',
                'Override provider-native server-side compaction for ChatGPT models. "default" follows the global chat setting ({0}). ' +
                'When effectively enabled, the Response API is asked to summarize older turns once the conversation grows past the provider\'s threshold.',
                `\`#${PREFERENCE_NAME_SERVER_SIDE_COMPACTION}#\``),
            tags: ['experimental'],
            title: AI_CORE_PREFERENCES_TITLE
        },
        [SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD_PREF]: {
            type: 'integer',
            minimum: SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD_MINIMUM,
            markdownDescription: nls.localize('theia/ai/chatgpt/compactionTokenThreshold/description',
                'Override the global input-token threshold for server-side compaction for ChatGPT models. When unset, the global setting or provider default applies. ' +
                'If set, the value must be at least 50,000 tokens.'),
            tags: ['experimental'],
            title: AI_CORE_PREFERENCES_TITLE
        },
        [MODELS_PREF]: {
            type: 'array',
            typeDetails: { [MODEL_PROVIDER_TYPE_DETAIL]: { label: 'ChatGPT' } satisfies ModelProviderTypeDetail },
            markdownDescription: MODELS_DESCRIPTION,
            tags: ['experimental'],
            title: AI_CORE_PREFERENCES_TITLE,
            default: [],
            items: {
                type: 'string'
            }
        }
    }
};
