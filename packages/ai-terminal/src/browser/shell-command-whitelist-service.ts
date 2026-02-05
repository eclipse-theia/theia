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
import { SHELL_COMMAND_WHITELIST_PREFERENCE } from '../common/shell-command-preferences';
import { ShellCommandAnalyzer } from '../common/shell-command-analyzer';

@injectable()
export class ShellCommandWhitelistService {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(ShellCommandAnalyzer)
    protected readonly shellCommandAnalyzer: ShellCommandAnalyzer;

    /**
     * Checks if a command is allowed based on the whitelist patterns.
     * Returns false if the command contains dangerous patterns or if the whitelist is empty.
     * Returns true only if ALL sub-commands match at least one whitelist pattern.
     */
    isCommandAllowed(command: string): boolean {
        if (this.shellCommandAnalyzer.containsDangerousPatterns(command)) {
            return false;
        }

        const patterns = this.getPatterns();
        if (patterns.length === 0) {
            return false;
        }

        const subCommands = this.shellCommandAnalyzer.parseCommand(command);
        if (subCommands.length === 0) {
            return false;
        }

        return subCommands.every(subCommand =>
            patterns.some(pattern => this.matchesPattern(subCommand, pattern))
        );
    }

    /**
     * Checks if a sub-command matches a whitelist pattern using Claude Code compatible syntax.
     * Supports * wildcards: trailing (optional args), leading (suffix match), middle (required match).
     */
    matchesPattern(subCommand: string, pattern: string): boolean {
        let regexStr = '';
        let i = 0;

        while (i < pattern.length) {
            const char = pattern[i];

            if (char === '*') {
                // Check if this is a trailing wildcard (at end, preceded by space)
                if (i === pattern.length - 1 && i > 0 && pattern[i - 1] === ' ') {
                    // Trailing " *" -> optional args: remove the space we added, add ( .*)?
                    regexStr = regexStr.slice(0, -1) + '( .*)?';
                } else {
                    // Leading or middle wildcard -> required match
                    regexStr += '.*';
                }
            } else if ('.+?^${}()|[]\\'.includes(char)) {
                // Escape regex special char
                regexStr += '\\' + char;
            } else {
                regexStr += char;
            }
            i++;
        }

        return new RegExp(`^${regexStr}$`).test(subCommand);
    }

    /**
     * Returns the current whitelist patterns from preferences.
     */
    getPatterns(): string[] {
        return this.preferenceService.get<string[]>(SHELL_COMMAND_WHITELIST_PREFERENCE, []);
    }

    /**
     * Adds a pattern to the whitelist.
     * Rejects empty or whitespace-only patterns, "*" alone, and invalid wildcard positions.
     * Trims the pattern before adding and avoids duplicates.
     */
    addPattern(pattern: string): void {
        const trimmed = pattern.trim();
        if (!trimmed) {
            throw new Error('Pattern cannot be empty or whitespace-only');
        }
        if (trimmed === '*') {
            throw new Error('Pattern "*" is too permissive - it would match all commands');
        }
        // Check for * not preceded by space (unless at position 0)
        // This regex finds * that is NOT at start AND NOT preceded by space
        if (/(?<!^)(?<! )\*/.test(trimmed)) {
            throw new Error('Wildcard * must be preceded by a space (e.g., "git log *" not "git log*")');
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
