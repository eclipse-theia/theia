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

import { AI_CORE_PREFERENCES_TITLE } from '@theia/ai-core/lib/common/ai-core-preferences';
import { createAIPreferenceProxy, DEFAULT_AI_PREFERENCE_SERVICE } from '@theia/ai-core/lib/common/ai-preference-binding';
import { nls } from '@theia/core';
import {
    createPreferenceProxy,
    PreferenceContribution,
    PreferenceProxy,
    PreferenceSchema,
    PreferenceService,
} from '@theia/core/lib/common/preferences';
import { interfaces } from '@theia/core/shared/inversify';

export type ChatToolPreferences = PreferenceProxy<ChatToolConfiguration>;

export const ChatToolPreferenceContribution = Symbol('ChatToolPreferenceContribution');
export const ChatToolPreferences = Symbol('ChatToolPreferences');

export function createChatToolPreferences(preferences: PreferenceService, schema: PreferenceSchema = chatToolPreferences): ChatToolPreferences {
    return createPreferenceProxy(preferences, schema);
}

/**
 * Bind the `ChatToolPreferences` proxy and its schema contribution.
 *
 * @param preferenceServiceId service identifier of the `PreferenceService` the proxy
 *   should read through. Defaults to the core `PreferenceService`. Pass
 *   `AIPreferenceService` when workspace trust should get enforced.
 */
export function bindChatToolPreferences(
    bind: interfaces.Bind,
    preferenceServiceId: interfaces.ServiceIdentifier<PreferenceService> = DEFAULT_AI_PREFERENCE_SERVICE,
): void {
    bind(ChatToolPreferences).toDynamicValue(ctx =>
        createAIPreferenceProxy(ctx, preferenceServiceId, createChatToolPreferences, chatToolPreferences)
    ).inSingletonScope();
    bind(ChatToolPreferenceContribution).toConstantValue({ schema: chatToolPreferences });
    bind(PreferenceContribution).toService(ChatToolPreferenceContribution);
}

/**
 * Enum for tool confirmation modes
 */
export enum ToolConfirmationMode {
    ALWAYS_ALLOW = 'always_allow',
    CONFIRM = 'confirm',
    DISABLED = 'disabled'
}

export const TOOL_CONFIRMATION_PREFERENCE = 'ai-features.chat.toolConfirmation';
export const TOOL_CONFIRMATION_TIMEOUT_PREFERENCE = 'ai-features.chat.toolConfirmationTimeout';

export const chatToolPreferences: PreferenceSchema = {
    properties: {
        [TOOL_CONFIRMATION_PREFERENCE]: {
            type: 'object',
            additionalProperties: {
                type: 'string',
                enum: [ToolConfirmationMode.ALWAYS_ALLOW, ToolConfirmationMode.CONFIRM, ToolConfirmationMode.DISABLED],
                enumDescriptions: [
                    nls.localize('theia/ai/chat/toolConfirmation/yolo/description', 'Execute tools automatically without confirmation'),
                    nls.localize('theia/ai/chat/toolConfirmation/confirm/description', 'Ask for confirmation before executing tools'),
                    nls.localize('theia/ai/chat/toolConfirmation/disabled/description', 'Disable tool execution')
                ]
            },
            default: {},
            description: nls.localize('theia/ai/chat/toolConfirmation/description',
                'Configure confirmation behavior for different tools. Key is the tool ID, value is the confirmation mode. ' +
                'Use "*" as the key to set a global default for all tools.'),
            title: AI_CORE_PREFERENCES_TITLE,
        },
        [TOOL_CONFIRMATION_TIMEOUT_PREFERENCE]: {
            type: 'number',
            default: 0,
            minimum: 0,
            description: nls.localize('theia/ai/chat/toolConfirmationTimeout/description',
                'Timeout in seconds for tool confirmation dialogs. When set to a positive value, tool confirmations will automatically be denied ' +
                'after the specified duration. Set to 0 to disable (default).'),
            title: AI_CORE_PREFERENCES_TITLE,
        }
    }
};

export interface ChatToolConfiguration {
    [TOOL_CONFIRMATION_PREFERENCE]: { [toolId: string]: ToolConfirmationMode };
    [TOOL_CONFIRMATION_TIMEOUT_PREFERENCE]: number;
}
