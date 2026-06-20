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
import { SHELL_COMMAND_ALLOWLIST_PREFERENCE, SHELL_COMMAND_DENYLIST_PREFERENCE } from '../common/shell-command-preferences';
import { ShellCommandAnalyzer } from '../common/shell-command-analyzer';

export interface CommandCheckResult {
    allowed: boolean;
    reason?: 'denied' | 'dangerous' | 'not-allowed';
    matchedPattern?: string;
}

/**
 * Full analysis of a command for the confirmation UI.
 * Provides everything needed to generate meaningful allow/deny pattern options.
 */
export interface CommandAnalysis {
    /** The individual sub-commands parsed from the full command. */
    subCommands: string[];
    /** Whether the command contains dangerous shell patterns (allowlist is bypassed for these). */
    hasDangerousPatterns: boolean;
    /** Sub-commands not yet covered by any allowlist pattern. */
    unallowedSubCommands: string[];
}

@injectable()
export class ShellCommandPermissionService {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(ShellCommandAnalyzer)
    protected readonly shellCommandAnalyzer: ShellCommandAnalyzer;

    /**
     * Provides a full analysis of a command for the confirmation UI.
     * Returns parsed sub-commands, dangerous pattern detection, and which
     * sub-commands are not yet covered by the allowlist.
     */
    analyzeCommand(command: string): CommandAnalysis {
        const subCommands = this.shellCommandAnalyzer.parseCommand(command);
        const hasDangerousPatterns = this.shellCommandAnalyzer.containsDangerousPatterns(command);

        const allowlistPatterns = this.getAllowlistPatterns();
        const unallowedSubCommands = subCommands.filter(subCommand =>
            !allowlistPatterns.some(pattern => this.matchesPattern(subCommand, pattern))
        );

        return { subCommands, hasDangerousPatterns, unallowedSubCommands };
    }

    /**
     * Checks if a command is allowed based on the allowlist patterns.
     * Returns false if the command contains dangerous patterns, is on the denylist, or if the allowlist is empty.
     * Returns true only if ALL sub-commands match at least one allowlist pattern.
     */
    isCommandAllowed(command: string): boolean {
        return this.checkCommand(command).allowed;
    }

    /** Returns true if ANY sub-command matches ANY denylist pattern. */
    isCommandDenylisted(command: string): boolean {
        return this.checkCommand(command).reason === 'denied';
    }

    /**
     * Checks a command and returns detailed result with precedence:
     * 1. Matches denylist → { allowed: false, reason: 'denied', matchedPattern }
     * 2. Matches dangerous patterns → { allowed: false, reason: 'dangerous' }
     * 3. Matches allowlist → { allowed: true }
     * 4. Otherwise → { allowed: false, reason: 'not-allowed' }
     */
    checkCommand(command: string): CommandCheckResult {
        const denylistPatterns = this.getDenylistPatterns();
        const subCommands = this.shellCommandAnalyzer.parseCommand(command);

        for (const subCommand of subCommands) {
            for (const pattern of denylistPatterns) {
                if (this.matchesPattern(subCommand, pattern)) {
                    return { allowed: false, reason: 'denied', matchedPattern: pattern };
                }
            }
        }

        if (this.shellCommandAnalyzer.containsDangerousPatterns(command)) {
            return { allowed: false, reason: 'dangerous' };
        }

        const allowlistPatterns = this.getAllowlistPatterns();
        if (allowlistPatterns.length > 0 && subCommands.length > 0) {
            const allAllowed = subCommands.every(subCommand =>
                allowlistPatterns.some(pattern => this.matchesPattern(subCommand, pattern))
            );
            if (allAllowed) {
                return { allowed: true };
            }
        }

        return { allowed: false, reason: 'not-allowed' };
    }

    /**
     * Checks if a sub-command matches an allowlist pattern using Claude Code compatible syntax.
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

    getAllowlistPatterns(): string[] {
        return this.preferenceService.get<string[]>(SHELL_COMMAND_ALLOWLIST_PREFERENCE, []);
    }

    /**
     * Adds one or more patterns to the allowlist in a single update.
     * Rejects empty or whitespace-only patterns, "*" alone, and invalid wildcard positions.
     * Trims patterns before adding and avoids duplicates.
     */
    addAllowlistPatterns(...patterns: string[]): void {
        this.addPatternsToList(patterns, SHELL_COMMAND_ALLOWLIST_PREFERENCE, () => this.getAllowlistPatterns());
    }

    removeAllowlistPattern(pattern: string): void {
        this.removePatternFromList(pattern, SHELL_COMMAND_ALLOWLIST_PREFERENCE, () => this.getAllowlistPatterns());
    }

    getDenylistPatterns(): string[] {
        return this.preferenceService.get<string[]>(SHELL_COMMAND_DENYLIST_PREFERENCE, []);
    }

    /**
     * Adds one or more patterns to the denylist in a single update.
     * Uses the same validation as allowlist patterns.
     */
    addDenylistPatterns(...patterns: string[]): void {
        this.addPatternsToList(patterns, SHELL_COMMAND_DENYLIST_PREFERENCE, () => this.getDenylistPatterns());
    }

    removeDenylistPattern(pattern: string): void {
        this.removePatternFromList(pattern, SHELL_COMMAND_DENYLIST_PREFERENCE, () => this.getDenylistPatterns());
    }

    /**
     * Validates a pattern and returns the trimmed version.
     * Throws an error if the pattern is invalid.
     */
    protected validatePattern(pattern: string): string {
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
        return trimmed;
    }

    protected addPatternsToList(patterns: string[], preferenceKey: string, getCurrentPatterns: () => string[]): void {
        const validated = patterns.map(p => this.validatePattern(p));
        const currentPatterns = getCurrentPatterns();
        const newPatterns = validated.filter(p => !currentPatterns.includes(p));
        if (newPatterns.length > 0) {
            this.preferenceService.updateValue(
                preferenceKey,
                [...currentPatterns, ...newPatterns]
            );
        }
    }

    protected removePatternFromList(pattern: string, preferenceKey: string, getCurrentPatterns: () => string[]): void {
        const currentPatterns = getCurrentPatterns();
        const filtered = currentPatterns.filter(p => p !== pattern);
        if (filtered.length !== currentPatterns.length) {
            this.preferenceService.updateValue(
                preferenceKey,
                filtered
            );
        }
    }
}
