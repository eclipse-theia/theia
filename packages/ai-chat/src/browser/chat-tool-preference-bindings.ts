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
import {
    ToolConfirmationMode,
    TOOL_CONFIRMATION_PREFERENCE,
    DEFAULT_TOOL_CONFIRMATION_PREFERENCE
} from '../common/chat-tool-preferences';
import { ToolRequest } from '@theia/ai-core';
import { TrustAwarePreferenceReader } from '@theia/ai-core/lib/browser/trust-aware-preference-reader';

/**
 * Utility class to manage tool confirmation settings
 */
@injectable()
export class ToolConfirmationManager {
    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(TrustAwarePreferenceReader)
    protected readonly trustAwareReader: TrustAwarePreferenceReader;

    // In-memory session overrides (not persisted), per chat
    protected sessionOverrides: Map<string, Map<string, ToolConfirmationMode>> = new Map();

    /**
     * Get the global default confirmation mode (used when no tool-specific entry exists).
     *
     * Read through the trust-aware reader so that an untrusted workspace cannot override
     * the default to a more permissive value.
     */
    getDefaultConfirmationMode(): ToolConfirmationMode {
        const value = this.trustAwareReader.get<ToolConfirmationMode>(DEFAULT_TOOL_CONFIRMATION_PREFERENCE);
        return value ?? this.getDefaultPreferenceSchemaDefault();
    }

    /**
     * Set the global default confirmation mode.
     */
    setDefaultConfirmationMode(mode: ToolConfirmationMode): void {
        this.preferenceService.updateValue(DEFAULT_TOOL_CONFIRMATION_PREFERENCE, mode);
    }

    /**
     * Get the confirmation mode for a specific tool, considering session overrides first (per chat).
     *
     * For tools with `confirmAlwaysAllow` flag:
     * - They default to CONFIRM mode instead of inheriting ALWAYS_ALLOW from the global default.
     * - Tool-specific preference entries are still respected (informed user consent).
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
        const toolConfirmation = this.trustAwareReader.get<Record<string, ToolConfirmationMode>>(
            TOOL_CONFIRMATION_PREFERENCE, {}
        ) ?? {};
        if (toolId in toolConfirmation) {
            return toolConfirmation[toolId];
        }
        const defaultMode = this.getDefaultConfirmationMode();
        // For confirmAlwaysAllow tools, don't inherit a global ALWAYS_ALLOW default
        if (toolRequest?.confirmAlwaysAllow && defaultMode === ToolConfirmationMode.ALWAYS_ALLOW) {
            return ToolConfirmationMode.CONFIRM;
        }
        return defaultMode;
    }

    /**
     * Set the confirmation mode for a specific tool (persisted)
     *
     * @param toolId - The tool identifier
     * @param mode - The confirmation mode to set
     * @param toolRequest - Optional ToolRequest to check for confirmAlwaysAllow flag
     */
    setConfirmationMode(toolId: string, mode: ToolConfirmationMode, toolRequest?: ToolRequest): void {
        const current = this.trustAwareReader.get<Record<string, ToolConfirmationMode>>(
            TOOL_CONFIRMATION_PREFERENCE, {}
        ) ?? {};
        const effectiveDefault = this.computeEffectiveDefaultForTool(toolId, toolRequest);
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
        return this.trustAwareReader.get<Record<string, ToolConfirmationMode>>(
            TOOL_CONFIRMATION_PREFERENCE, {}
        ) ?? {};
    }

    resetAllConfirmationModeSettings(): void {
        this.preferenceService.updateValue(TOOL_CONFIRMATION_PREFERENCE, {});
    }

    /**
     * Compute the effective default for a given tool, taking the schema-level default,
     * any product-shipped per-tool default, and the confirmAlwaysAllow flag into account.
     */
    protected computeEffectiveDefaultForTool(toolId: string, toolRequest?: ToolRequest): ToolConfirmationMode {
        const perToolDefaults = this.preferenceService.inspect(TOOL_CONFIRMATION_PREFERENCE)?.defaultValue as
            | { [toolId: string]: ToolConfirmationMode }
            | undefined;
        const perToolDefault = perToolDefaults?.[toolId];
        if (perToolDefault) {
            return perToolDefault;
        }
        const globalDefault = this.getDefaultConfirmationMode();
        if (toolRequest?.confirmAlwaysAllow && globalDefault === ToolConfirmationMode.ALWAYS_ALLOW) {
            return ToolConfirmationMode.CONFIRM;
        }
        return globalDefault;
    }

    /**
     * Read the schema-level default for the default-confirmation preference.
     * Falls back to CONFIRM if the preference service has not registered the schema yet.
     */
    protected getDefaultPreferenceSchemaDefault(): ToolConfirmationMode {
        const schemaDefault = this.preferenceService.inspect(DEFAULT_TOOL_CONFIRMATION_PREFERENCE)?.defaultValue as
            | ToolConfirmationMode
            | undefined;
        return schemaDefault ?? ToolConfirmationMode.CONFIRM;
    }
}
