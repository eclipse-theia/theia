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
    ToolConfirmationMode,
    TOOL_CONFIRMATION_PREFERENCE,
    DEFAULT_TOOL_CONFIRMATION_PREFERENCE
} from '../common/chat-tool-preferences';
import { AiConfigurationService, ToolRequest } from '@theia/ai-core';

/**
 * The loop-invariant inputs to {@link ToolConfirmationManager.computeEffectiveDefaultForTool}:
 * the product-shipped per-tool schema defaults and the effective global default. Reading these
 * once lets bulk operations avoid re-inspecting the preference schema per tool.
 */
interface ToolConfirmationDefaults {
    perToolDefaults?: { [toolId: string]: ToolConfirmationMode };
    globalDefault: ToolConfirmationMode;
}

/**
 * Utility class to manage tool confirmation settings
 */
@injectable()
export class ToolConfirmationManager {
    @inject(AiConfigurationService)
    protected readonly aiConfigurationService: AiConfigurationService;

    // In-memory session overrides (not persisted), per chat
    protected sessionOverrides: Map<string, Map<string, ToolConfirmationMode>> = new Map();

    /**
     * Get the global default confirmation mode (used when no tool-specific entry exists).
     *
     * Read through the trust-aware reader so that an untrusted workspace cannot override
     * the default to a more permissive value.
     */
    getDefaultConfirmationMode(): ToolConfirmationMode {
        const value = this.aiConfigurationService.get<ToolConfirmationMode>(DEFAULT_TOOL_CONFIRMATION_PREFERENCE);
        return value ?? this.getDefaultPreferenceSchemaDefault();
    }

    /**
     * Set the global default confirmation mode.
     *
     * Returns the promise produced by the underlying preference update so callers can
     * `await` completion and react to errors (e.g. show a notification on failure).
     */
    setDefaultConfirmationMode(mode: ToolConfirmationMode): Promise<void> {
        return this.aiConfigurationService.update(DEFAULT_TOOL_CONFIRMATION_PREFERENCE, mode);
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
        const toolConfirmation = this.aiConfigurationService.get<Record<string, ToolConfirmationMode>>(
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
    setConfirmationMode(toolId: string, mode: ToolConfirmationMode, toolRequest?: ToolRequest): Promise<void> {
        const current = this.aiConfigurationService.get<Record<string, ToolConfirmationMode>>(
            TOOL_CONFIRMATION_PREFERENCE, {}
        ) ?? {};
        const effectiveDefault = this.computeEffectiveDefaultForTool(toolId, toolRequest);
        if (mode === effectiveDefault) {
            if (toolId in current) {
                const { [toolId]: _, ...rest } = current;
                return this.aiConfigurationService.update(TOOL_CONFIRMATION_PREFERENCE, rest);
            }
            return Promise.resolve();
        }
        const updated = { ...current, [toolId]: mode };
        return this.aiConfigurationService.update(TOOL_CONFIRMATION_PREFERENCE, updated);
    }

    /**
     * Apply multiple per-tool confirmation modes with a single preference write.
     *
     * Preserves the same "remove entry if it matches the effective default" behavior as
     * {@link setConfirmationMode}. Use this for bulk operations to avoid one preference
     * round-trip per tool.
     */
    setConfirmationModes(updates: Iterable<{ toolId: string; mode: ToolConfirmationMode; toolRequest?: ToolRequest }>): Promise<void> {
        const current = this.aiConfigurationService.get<Record<string, ToolConfirmationMode>>(
            TOOL_CONFIRMATION_PREFERENCE, {}
        ) ?? {};
        const next: Record<string, ToolConfirmationMode> = { ...current };
        // Read the loop-invariant schema/global defaults once, not once per tool.
        const defaults = this.readConfirmationDefaults();
        let changed = false;
        for (const { toolId, mode, toolRequest } of updates) {
            const effectiveDefault = this.computeEffectiveDefaultForTool(toolId, toolRequest, defaults);
            if (mode === effectiveDefault) {
                if (toolId in next) {
                    delete next[toolId];
                    changed = true;
                }
            } else if (next[toolId] !== mode) {
                next[toolId] = mode;
                changed = true;
            }
        }
        // Avoid a redundant preference write (and the change event it fires) when nothing changed.
        if (!changed) {
            return Promise.resolve();
        }
        return this.aiConfigurationService.update(TOOL_CONFIRMATION_PREFERENCE, next);
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
        return this.aiConfigurationService.get<Record<string, ToolConfirmationMode>>(
            TOOL_CONFIRMATION_PREFERENCE, {}
        ) ?? {};
    }

    resetAllConfirmationModeSettings(): Promise<void> {
        return this.aiConfigurationService.update(TOOL_CONFIRMATION_PREFERENCE, {});
    }

    /**
     * Read the loop-invariant inputs for {@link computeEffectiveDefaultForTool}: the product-shipped
     * per-tool schema defaults and the effective global default.
     */
    protected readConfirmationDefaults(): ToolConfirmationDefaults {
        const perToolDefaults = this.aiConfigurationService.inspect(TOOL_CONFIRMATION_PREFERENCE)?.defaultValue as
            | { [toolId: string]: ToolConfirmationMode }
            | undefined;
        return { perToolDefaults, globalDefault: this.getDefaultConfirmationMode() };
    }

    protected computeEffectiveDefaultForTool(
        toolId: string,
        toolRequest?: ToolRequest,
        defaults: ToolConfirmationDefaults = this.readConfirmationDefaults()
    ): ToolConfirmationMode {
        const perToolDefault = defaults.perToolDefaults?.[toolId];
        if (perToolDefault) {
            return perToolDefault;
        }
        if (toolRequest?.confirmAlwaysAllow && defaults.globalDefault === ToolConfirmationMode.ALWAYS_ALLOW) {
            return ToolConfirmationMode.CONFIRM;
        }
        return defaults.globalDefault;
    }

    /**
     * Read the schema-level default for the default-confirmation preference.
     * Falls back to CONFIRM if the preference service has not registered the schema yet.
     */
    protected getDefaultPreferenceSchemaDefault(): ToolConfirmationMode {
        const schemaDefault = this.aiConfigurationService.inspect(DEFAULT_TOOL_CONFIRMATION_PREFERENCE)?.defaultValue as
            | ToolConfirmationMode
            | undefined;
        return schemaDefault ?? ToolConfirmationMode.CONFIRM;
    }
}
