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

export function bindChatToolPreferences(bind: interfaces.Bind): void {
    bind(ChatToolPreferences).toDynamicValue((ctx: interfaces.Context) => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(ChatToolPreferenceContribution);
        return createChatToolPreferences(preferences, contribution.schema);
    }).inSingletonScope();
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
export const DEFAULT_TOOL_CONFIRMATION_PREFERENCE = 'ai-features.chat.defaultToolConfirmation';
export const TOOL_CONFIRMATION_TIMEOUT_PREFERENCE = 'ai-features.chat.toolConfirmationTimeout';

const TOOL_CONFIRMATION_MODE_VALUES = [
    ToolConfirmationMode.ALWAYS_ALLOW,
    ToolConfirmationMode.CONFIRM,
    ToolConfirmationMode.DISABLED
];

const TOOL_CONFIRMATION_MODE_DESCRIPTIONS = [
    nls.localize('theia/ai/chat/toolConfirmation/alwaysAllow/description', 'Execute tools automatically without confirmation'),
    nls.localize('theia/ai/chat/toolConfirmation/confirm/description', 'Ask for confirmation before executing tools'),
    nls.localize('theia/ai/chat/toolConfirmation/disabled/description', 'Disable tool execution')
];

export const chatToolPreferences: PreferenceSchema = {
    properties: {
        [DEFAULT_TOOL_CONFIRMATION_PREFERENCE]: {
            type: 'string',
            enum: TOOL_CONFIRMATION_MODE_VALUES,
            enumDescriptions: TOOL_CONFIRMATION_MODE_DESCRIPTIONS,
            default: ToolConfirmationMode.CONFIRM,
            description: nls.localize('theia/ai/chat/defaultToolConfirmation/description',
                'Default confirmation behavior used for tools that do not have a tool-specific entry under ' +
                '"ai-features.chat.toolConfirmation". Tools that explicitly require confirmation before being auto-approved ' +
                'always default to "confirm" regardless of this setting.'),
            title: AI_CORE_PREFERENCES_TITLE,
        },
        [TOOL_CONFIRMATION_PREFERENCE]: {
            type: 'object',
            additionalProperties: {
                type: 'string',
                enum: TOOL_CONFIRMATION_MODE_VALUES,
                enumDescriptions: TOOL_CONFIRMATION_MODE_DESCRIPTIONS
            },
            default: {},
            description: nls.localize('theia/ai/chat/toolConfirmation/description',
                'Configure confirmation behavior for individual tools. Key is the tool ID, value is the confirmation mode. ' +
                'To change the default for all tools, use "ai-features.chat.defaultToolConfirmation".'),
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
    [DEFAULT_TOOL_CONFIRMATION_PREFERENCE]: ToolConfirmationMode;
    [TOOL_CONFIRMATION_TIMEOUT_PREFERENCE]: number;
}
