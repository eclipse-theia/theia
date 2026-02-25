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

import { injectable, inject } from '@theia/core/shared/inversify';
import {
    PreferenceService,
} from '@theia/core/lib/common/preferences';
import { ToolConfirmationMode, TOOL_CONFIRMATION_PREFERENCE, ChatToolPreferences } from '../common/chat-tool-preferences';
import { ToolRequest } from '@theia/ai-core';

/**
 * Utility class to manage tool confirmation settings
 */
@injectable()
export class ToolConfirmationManager {
    @inject(ChatToolPreferences)
    protected readonly preferences: ChatToolPreferences;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    // In-memory session overrides (not persisted), per chat
    protected sessionOverrides: Map<string, Map<string, ToolConfirmationMode>> = new Map();

    /**
     * Get the confirmation mode for a specific tool, considering session overrides first (per chat).
     *
     * For tools with `confirmAlwaysAllow` flag:
     * - They default to CONFIRM mode instead of ALWAYS_ALLOW
     * - They don't inherit global ALWAYS_ALLOW from the '*' preference
     *
     * @param toolId - The tool identifier
     * @param chatId - The chat session identifier
     * @param toolRequest - Optional ToolRequest to check for confirmAlwaysAllow flag
     */
    getConfirmationMode(toolId: string, chatId: string, toolRequest?: ToolRequest): ToolConfirmationMode {
        const chatMap = this.sessionOverrides.get(chatId);
        if (chatMap && chatMap.has(toolId)) {
            return chatMap.get(toolId)!;
        }
        const toolConfirmation = this.preferences[TOOL_CONFIRMATION_PREFERENCE];
        if (toolConfirmation[toolId]) {
            return toolConfirmation[toolId];
        }
        if (toolConfirmation['*']) {
            // For confirmAlwaysAllow tools, don't inherit global ALWAYS_ALLOW
            if (toolRequest?.confirmAlwaysAllow && toolConfirmation['*'] === ToolConfirmationMode.ALWAYS_ALLOW) {
                return ToolConfirmationMode.CONFIRM;
            }
            return toolConfirmation['*'];
        }

        // Default: ALWAYS_ALLOW for normal tools, CONFIRM for confirmAlwaysAllow tools
        return toolRequest?.confirmAlwaysAllow
            ? ToolConfirmationMode.CONFIRM
            : ToolConfirmationMode.ALWAYS_ALLOW;
    }

    /**
     * Set the confirmation mode for a specific tool (persisted)
     *
     * @param toolId - The tool identifier
     * @param mode - The confirmation mode to set
     * @param toolRequest - Optional ToolRequest to check for confirmAlwaysAllow flag
     */
    setConfirmationMode(toolId: string, mode: ToolConfirmationMode, toolRequest?: ToolRequest): void {
        const defaultPref = this.preferenceService.inspect(TOOL_CONFIRMATION_PREFERENCE)?.defaultValue as {
            [toolId: string]: ToolConfirmationMode;
        } || {};
        const current = this.preferences[TOOL_CONFIRMATION_PREFERENCE] || {};
        let starMode = current['*'];
        if (starMode === undefined) {
            starMode = defaultPref['*'] ?? ToolConfirmationMode.ALWAYS_ALLOW;
        }
        // For confirmAlwaysAllow tools, the effective default is CONFIRM, not ALWAYS_ALLOW
        const effectiveDefault = (toolRequest?.confirmAlwaysAllow && starMode === ToolConfirmationMode.ALWAYS_ALLOW)
            ? ToolConfirmationMode.CONFIRM
            : defaultPref[toolId] ?? starMode;
        if (mode === effectiveDefault) {
            if (toolId in current) {
                const { [toolId]: _, ...rest } = current;
                this.preferenceService.updateValue(TOOL_CONFIRMATION_PREFERENCE, rest);
            }
        } else {
            const updated = { ...current, [toolId]: mode };
            this.preferenceService.updateValue(TOOL_CONFIRMATION_PREFERENCE, updated);
        }
    }

    /**
     * Set the confirmation mode for a specific tool for this session only (not persisted, per chat)
     */
    setSessionConfirmationMode(toolId: string, mode: ToolConfirmationMode, chatId: string): void {
        let chatMap = this.sessionOverrides.get(chatId);
        if (!chatMap) {
            chatMap = new Map();
            this.sessionOverrides.set(chatId, chatMap);
        }
        chatMap.set(toolId, mode);
    }

    /**
     * Clear all session overrides for a specific chat, or all if no chatId is given
     */
    clearSessionOverrides(chatId?: string): void {
        if (chatId) {
            this.sessionOverrides.delete(chatId);
        } else {
            this.sessionOverrides.clear();
        }
    }

    /**
     * Get all tool confirmation settings
     */
    getAllConfirmationSettings(): { [toolId: string]: ToolConfirmationMode } {
        return this.preferences[TOOL_CONFIRMATION_PREFERENCE] || {};
    }

    resetAllConfirmationModeSettings(): void {
        const current = this.preferences[TOOL_CONFIRMATION_PREFERENCE] || {};
        if ('*' in current) {
            this.preferenceService.updateValue(TOOL_CONFIRMATION_PREFERENCE, { '*': current['*'] });
        } else {
            this.preferenceService.updateValue(TOOL_CONFIRMATION_PREFERENCE, {});
        }
    }
}
