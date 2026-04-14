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
        }
    }
};

export interface ChatViewConfiguration {
    [CHAT_VIEW_TOKEN_USAGE_ENABLED]: boolean;
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
