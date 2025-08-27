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
     * Get the confirmation mode for a specific tool, considering session overrides first (per chat)
     */
    getConfirmationMode(toolId: string, chatId: string): ToolConfirmationMode {
        const chatMap = this.sessionOverrides.get(chatId);
        if (chatMap && chatMap.has(toolId)) {
            return chatMap.get(toolId)!;
        }
        const toolConfirmation = this.preferences[TOOL_CONFIRMATION_PREFERENCE];
        if (toolConfirmation[toolId]) {
            return toolConfirmation[toolId];
        }
        if (toolConfirmation['*']) {
            return toolConfirmation['*'];
        }
        return ToolConfirmationMode.ALWAYS_ALLOW; // Default to Always Allow
    }

    /**
     * Set the confirmation mode for a specific tool (persisted)
     */
    setConfirmationMode(toolId: string, mode: ToolConfirmationMode): void {
        const current = this.preferences[TOOL_CONFIRMATION_PREFERENCE] || {};
        // Determine the global default (star entry), or fallback to schema default
        let starMode = current['*'];
        if (starMode === undefined) {
            starMode = ToolConfirmationMode.ALWAYS_ALLOW;
        }
        if (mode === starMode) {
            // Remove the toolId entry if it exists
            if (toolId in current) {
                const { [toolId]: _, ...rest } = current;
                this.preferenceService.updateValue(TOOL_CONFIRMATION_PREFERENCE, rest);
            }
            // else, nothing to update
        } else {
            // Set or update the toolId entry
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
