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

/**
 * Pattern to match command concatenation operators: &&, ||, ;, |
 */
const COMMAND_SEPARATOR_PATTERN = /\s*(?:&&|\|\||\||;)\s*/;

/**
 * Pattern to detect dangerous command substitution: $( or backticks
 */
const DANGEROUS_PATTERN = /\$\(|`/;

/**
 * Checks if a command contains dangerous patterns that could indicate
 * bypass attacks (command substitution via $() or backticks).
 *
 * @param command The shell command to analyze
 * @returns true if the command contains dangerous patterns, false otherwise
 */
export function containsDangerousPatterns(command: string): boolean {
    return DANGEROUS_PATTERN.test(command);
}

/**
 * Parses a shell command string into individual sub-commands by splitting
 * on concatenation operators (&&, ||, ;, |).
 *
 * @param command The shell command to parse
 * @returns Array of trimmed sub-commands with empty entries filtered out
 */
export function parseCommand(command: string): string[] {
    return command
        .split(COMMAND_SEPARATOR_PATTERN)
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 0);
}
