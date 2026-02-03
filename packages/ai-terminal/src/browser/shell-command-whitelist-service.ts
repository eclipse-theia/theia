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

import { inject, injectable } from '@theia/core/shared/inversify';
import { PreferenceService } from '@theia/core/lib/common';
import { SHELL_COMMAND_WHITELIST_PREFERENCE } from '@theia/ai-chat/lib/common/chat-tool-preferences';
import { containsDangerousPatterns, parseCommand } from '../common/shell-command-analyzer';

@injectable()
export class ShellCommandWhitelistService {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    /**
     * Checks if a command is allowed based on the whitelist patterns.
     * Returns false if the command contains dangerous patterns or if the whitelist is empty.
     * Returns true only if ALL sub-commands match at least one whitelist pattern.
     */
    isCommandAllowed(command: string): boolean {
        if (containsDangerousPatterns(command)) {
            return false;
        }

        const patterns = this.getPatterns();
        if (patterns.length === 0) {
            return false;
        }

        const subCommands = parseCommand(command);
        if (subCommands.length === 0) {
            return false;
        }

        return subCommands.every(subCommand =>
            patterns.some(pattern => this.matchesPattern(subCommand, pattern))
        );
    }

    /**
     * Checks if a sub-command matches a whitelist pattern using word-boundary prefix matching.
     * Pattern must match the start of the command and end at a word boundary.
     */
    matchesPattern(subCommand: string, pattern: string): boolean {
        return subCommand === pattern || subCommand.startsWith(pattern + ' ');
    }

    /**
     * Returns the current whitelist patterns from preferences.
     */
    getPatterns(): string[] {
        return this.preferenceService.get<string[]>(SHELL_COMMAND_WHITELIST_PREFERENCE, []);
    }

    /**
     * Adds a pattern to the whitelist.
     * Rejects empty or whitespace-only patterns.
     * Trims the pattern before adding and avoids duplicates.
     */
    addPattern(pattern: string): void {
        const trimmed = pattern.trim();
        if (trimmed.length === 0) {
            throw new Error('Pattern cannot be empty or whitespace-only');
        }

        const currentPatterns = this.getPatterns();
        if (!currentPatterns.includes(trimmed)) {
            this.preferenceService.updateValue(
                SHELL_COMMAND_WHITELIST_PREFERENCE,
                [...currentPatterns, trimmed]
            );
        }
    }

    /**
     * Removes a pattern from the whitelist.
     */
    removePattern(pattern: string): void {
        const currentPatterns = this.getPatterns();
        const filtered = currentPatterns.filter(p => p !== pattern);
        if (filtered.length !== currentPatterns.length) {
            this.preferenceService.updateValue(
                SHELL_COMMAND_WHITELIST_PREFERENCE,
                filtered
            );
        }
    }
}
