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

import { createPreferenceProxy, PreferenceContribution, PreferenceProxy, PreferenceSchema, PreferenceService } from '@theia/core/lib/common/preferences';
import { nls } from '@theia/core/lib/common/nls';
import { interfaces } from '@theia/core/shared/inversify';

export const CHAT_VIEW_TOKEN_USAGE_ENABLED = 'ai-features.chat.tokenUsageIndicator.enabled';
export const CHAT_VIEW_TOKEN_USAGE_WARNING_ENABLED = 'ai-features.chat.tokenUsageWarning.enabled';
export const CHAT_VIEW_TOKEN_USAGE_WARNING_THRESHOLD_PERCENTAGE = 'ai-features.chat.tokenUsageWarning.defaultThresholdPercentage';

export const CHAT_VIEW_TOKEN_USAGE_WARNING_THRESHOLD_PERCENTAGE_DEFAULT = 80;

export const chatViewPreferenceSchema: PreferenceSchema = {
    properties: {
        [CHAT_VIEW_TOKEN_USAGE_ENABLED]: {
            type: 'boolean',
            default: false,
            description: nls.localize(
                'theia/ai/chat-ui/tokenUsageIndicatorEnabled',
                'Controls whether the experimental token usage indicator is shown in the chat view. ' +
                'This feature is experimental and token counts may be inaccurate depending on the model and provider.'
            ),
            tags: ['experimental']
        },
        [CHAT_VIEW_TOKEN_USAGE_WARNING_ENABLED]: {
            type: 'boolean',
            default: false,
            description: nls.localize(
                'theia/ai/chat-ui/tokenUsageWarningEnabled',
                'Controls whether a notification is shown when a chat session\'s token usage crosses the configured threshold. ' +
                'Requires the language model provider to report token usage.'
            ),
            tags: ['experimental']
        },
        [CHAT_VIEW_TOKEN_USAGE_WARNING_THRESHOLD_PERCENTAGE]: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            default: CHAT_VIEW_TOKEN_USAGE_WARNING_THRESHOLD_PERCENTAGE_DEFAULT,
            description: nls.localize(
                'theia/ai/chat-ui/tokenUsageWarningThresholdPercentage',
                'Percentage of the model\'s context window at which the token usage warning is triggered. ' +
                'This value also drives the warning/error color bands of the token usage indicator. ' +
                'Currently resolves against an assumed 200k context window; will use the real per-model context size once available.'
            ),
            tags: ['experimental']
        }
    }
};

export interface ChatViewConfiguration {
    [CHAT_VIEW_TOKEN_USAGE_ENABLED]: boolean;
    [CHAT_VIEW_TOKEN_USAGE_WARNING_ENABLED]: boolean;
    [CHAT_VIEW_TOKEN_USAGE_WARNING_THRESHOLD_PERCENTAGE]: number;
}

export const ChatViewPreferenceContribution = Symbol('ChatViewPreferenceContribution');
export const ChatViewPreferences = Symbol('ChatViewPreferences');
export type ChatViewPreferences = PreferenceProxy<ChatViewConfiguration>;

export function createChatViewPreferences(preferences: PreferenceService, schema: PreferenceSchema = chatViewPreferenceSchema): ChatViewPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindChatViewPreferences(bind: interfaces.Bind): void {
    bind(ChatViewPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(ChatViewPreferenceContribution);
        return createChatViewPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(ChatViewPreferenceContribution).toConstantValue({ schema: chatViewPreferenceSchema });
    bind(PreferenceContribution).toService(ChatViewPreferenceContribution);
}
