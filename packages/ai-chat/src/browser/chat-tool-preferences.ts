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

import { AI_CORE_PREFERENCES_TITLE } from '@theia/ai-core/lib/browser/ai-core-preferences';
import { nls } from '@theia/core';
import { interfaces, injectable, inject } from '@theia/core/shared/inversify';
import {
    createPreferenceProxy,
    PreferenceProxy,
    PreferenceService,
    PreferenceSchema,
    PreferenceContribution
} from '@theia/core/lib/browser/preferences';

/**
 * Enum for tool confirmation modes
 */
export enum ToolConfirmationMode {
    YOLO = 'yolo',
    CONFIRM = 'confirm',
    DISABLED = 'disabled'
}

export const TOOL_CONFIRMATION_PREFERENCE = 'ai-features.chat.toolConfirmation';

export const chatToolPreferences: PreferenceSchema = {
    type: 'object',
    properties: {
        [TOOL_CONFIRMATION_PREFERENCE]: {
            type: 'object',
            additionalProperties: {
                type: 'string',
                enum: [ToolConfirmationMode.YOLO, ToolConfirmationMode.CONFIRM, ToolConfirmationMode.DISABLED],
                enumDescriptions: [
                    nls.localize('theia/ai/chat/toolConfirmation/yolo/description', 'Execute tools automatically without confirmation'),
                    nls.localize('theia/ai/chat/toolConfirmation/confirm/description', 'Ask for confirmation before executing tools'),
                    nls.localize('theia/ai/chat/toolConfirmation/disabled/description', 'Disable tool execution')
                ]
            },
            default: {},
            description: nls.localize('theia/ai/chat/toolConfirmation/description',
                'Configure confirmation behavior for different tools. Key is the tool ID, value is the confirmation mode.'),
            title: AI_CORE_PREFERENCES_TITLE,
        }
    }
};

export interface ChatToolConfiguration {
    [TOOL_CONFIRMATION_PREFERENCE]: { [toolId: string]: ToolConfirmationMode };
}

export const ChatToolPreferenceContribution = Symbol('ChatToolPreferenceContribution');
export const ChatToolPreferences = Symbol('ChatToolPreferences');
export type ChatToolPreferences = PreferenceProxy<ChatToolConfiguration>;

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
 * Utility class to manage tool confirmation settings
 */
@injectable()
export class ToolConfirmationManager {

    @inject(ChatToolPreferences)
    protected readonly preferences: ChatToolPreferences;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    /**
     * Get the confirmation mode for a specific tool
     */
    getConfirmationMode(toolId: string): ToolConfirmationMode {
        const toolConfirmation = this.preferences[TOOL_CONFIRMATION_PREFERENCE];
        return toolConfirmation[toolId] || ToolConfirmationMode.CONFIRM; // Default to confirm
    }

    /**
     * Set the confirmation mode for a specific tool
     */
    setConfirmationMode(toolId: string, mode: ToolConfirmationMode): void {
        const current = this.preferences[TOOL_CONFIRMATION_PREFERENCE] || {};
        const updated = { ...current, [toolId]: mode };
        this.preferenceService.updateValue(TOOL_CONFIRMATION_PREFERENCE, updated);
    }

    /**
     * Get all tool confirmation settings
     */
    getAllConfirmationSettings(): { [toolId: string]: ToolConfirmationMode } {
        return this.preferences[TOOL_CONFIRMATION_PREFERENCE] || {};
    }
}
