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

import { injectable } from '@theia/core/shared/inversify';

/**
 * Pattern to detect dangerous shell patterns:
 * - $( - command substitution
 * - ` - backtick command substitution
 * - <( - process substitution (input)
 * - >( - process substitution (output)
 * - ${ - parameter expansion with braces (can execute code via ${var:-$(cmd)})
 * - \n, \r - newlines (shell treats them as command separators)
 *
 * Note: `-exec` family flags (e.g., `find -exec`, `git rebase --exec`) are
 * detected separately in `containsDangerousPatterns` via EXEC_FLAG_PATTERN.
 */
const DANGEROUS_PATTERN = /\$\(|`|<\(|>\(|\$\{|\n|\r/;

/**
 * Pattern to detect `-exec` family argument flags that allow arbitrary command execution.
 * Matches: -exec, --exec, -execdir, --execdir, -ok, -okdir
 * These are used by commands like `find -exec rm {} \;` or `git rebase --exec="make test"`.
 * The pattern requires word boundaries (start-of-string or whitespace before, whitespace/=/end after)
 * to avoid false positives on words like "executable" or "--executor".
 */
const EXEC_FLAG_PATTERN = /(?:^|\s)(?:--?exec(?:dir)?|-ok(?:dir)?)(?:\s|=|$)/;

export const ShellCommandAnalyzer = Symbol('ShellCommandAnalyzer');

export interface ShellCommandAnalyzer {
    /**
     * Checks if a command contains dangerous patterns that could indicate
     * bypass attacks. Detects:
     * - Command substitution via $() or backticks
     * - Process substitution via <() or >()
     * - Parameter expansion with braces via ${}
     * - Subshell execution when command starts with (
     *
     * @param command The shell command to analyze
     * @returns true if the command contains dangerous patterns, false otherwise
     */
    containsDangerousPatterns(command: string): boolean;

    /**
     * Parses a shell command string into individual sub-commands using a
     * quote-aware state-machine tokenizer. Respects single quotes, double
     * quotes, and backslash escapes. Splits on operators `&&`, `||`, `|&`,
     * `|`, `&`, and `;`, as well as newline characters outside quotes.
     * Collapses runs of whitespace outside quotes and strips meaningless
     * backslash escapes outside quotes (e.g. `\h` → `h`). Degrades
     * gracefully when quotes are unmatched.
     *
     * @param command The shell command to parse
     * @returns Array of trimmed sub-commands with empty entries filtered out
     */
    parseCommand(command: string): string[];
}

@injectable()
export class DefaultShellCommandAnalyzer implements ShellCommandAnalyzer {

    containsDangerousPatterns(command: string): boolean {
        const trimmed = command.trimStart();
        if (trimmed.startsWith('(')) {
            return true;
        }
        if (/^case\s/.test(trimmed)) {
            return true;
        }
        if (trimmed.startsWith('{')) {
            return true;
        }
        if (/^coproc\s/.test(trimmed)) {
            return true;
        }
        if (EXEC_FLAG_PATTERN.test(command)) {
            return true;
        }
        return DANGEROUS_PATTERN.test(command);
    }

    parseCommand(command: string): string[] {
        const results: string[] = [];
        let current = '';
        let inDouble = false;
        let inSingle = false;
        let escaped = false;

        for (let i = 0; i < command.length; i++) {
            const ch = command[i];

            if (escaped) {
                current += ch;
                escaped = false;
                continue;
            }

            if (inSingle) {
                current += ch;
                if (ch === "'") {
                    inSingle = false;
                }
                continue;
            }

            if (inDouble) {
                if (ch === '\\') {
                    const next = command[i + 1];
                    if (next === '"' || next === '\\') {
                        current += ch + next;
                        i++;
                        continue;
                    }
                }
                current += ch;
                if (ch === '"') {
                    inDouble = false;
                }
                continue;
            }

            // Outside quotes

            // Handle newline/carriage-return as command separators
            if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && command[i + 1] === '\n') {
                    i++; // consume \r\n as a single separator
                }
                this.pushSubCommand(results, current);
                current = '';
                continue;
            }

            if (ch === '\\') {
                const next = command[i + 1];
                if (next !== undefined && !'|&;"\'\\\n\r \t'.includes(next)) {
                    // Non-special character after backslash: strip the backslash, keep next char
                    current += next;
                    i++;
                } else {
                    escaped = true;
                    current += ch;
                }
                continue;
            }

            // Collapse whitespace outside quotes: runs of spaces/tabs become a single space
            if (ch === ' ' || ch === '\t') {
                if (current.length > 0 && !current.endsWith(' ')) {
                    current += ' ';
                }
                continue;
            }

            if (ch === '"') {
                inDouble = true;
                current += ch;
                continue;
            }

            if (ch === "'") {
                inSingle = true;
                current += ch;
                continue;
            }

            // Check for multi-character separators first
            if (ch === '&' && command[i + 1] === '&') {
                this.pushSubCommand(results, current);
                current = '';
                i++; // skip second '&'
                continue;
            }

            if (ch === '|' && command[i + 1] === '|') {
                this.pushSubCommand(results, current);
                current = '';
                i++; // skip second '|'
                continue;
            }

            if (ch === '|' && command[i + 1] === '&') {
                this.pushSubCommand(results, current);
                current = '';
                i++; // skip '&'
                continue;
            }

            if (ch === '|') {
                this.pushSubCommand(results, current);
                current = '';
                continue;
            }

            if (ch === '&') {
                // Don't split when & is part of a file descriptor redirect
                // e.g., 2>&1, >&2, <&3, &>file, &>>file
                if (current.endsWith('>') || current.endsWith('<') || command[i + 1] === '>') {
                    current += ch;
                    continue;
                }
                this.pushSubCommand(results, current);
                current = '';
                continue;
            }

            if (ch === ';') {
                this.pushSubCommand(results, current);
                current = '';
                continue;
            }

            current += ch;
        }

        this.pushSubCommand(results, current);
        return results;
    }

    protected pushSubCommand(results: string[], sub: string): void {
        const trimmed = sub.trim();
        if (trimmed.length > 0) {
            results.push(trimmed);
        }
    }
}
