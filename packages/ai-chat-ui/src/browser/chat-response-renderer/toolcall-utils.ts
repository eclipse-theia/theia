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
 * Condenses JSON tool call arguments into a readable preview string.
 * @param args - JSON string of tool call arguments
 * @returns A condensed string representation, or undefined for empty args
 */
export function condenseArguments(args: string): string | undefined {
    if (!args || !args.trim() || args.trim() === '{}') {
        return undefined;
    }

    const MAX_TOTAL_LENGTH = 80;

    let parsed: unknown;
    try {
        parsed = JSON.parse(args);
    } catch {
        return '...';
    }

    // Handle non-object parsed results (arrays, strings, numbers, null, etc.)
    // Note: JSON.parse('null') returns null, so we need to handle it separately
    // eslint-disable-next-line no-null/no-null
    if (typeof parsed !== 'object' || parsed === undefined || parsed === null || Array.isArray(parsed)) {
        const stringified = JSON.stringify(parsed);
        if (stringified.length > MAX_TOTAL_LENGTH) {
            return stringified.substring(0, MAX_TOTAL_LENGTH - 3) + '...';
        }
        return stringified;
    }

    const entries = Object.entries(parsed as Record<string, unknown>);

    // Multiple params: just show '...'
    if (entries.length > 1) {
        return '...';
    }

    // Single param: show the value without key name
    const [, value] = entries[0];
    let valueStr: string;
    if (typeof value === 'string') {
        valueStr = `'${value}'`;
    } else if (Array.isArray(value)) {
        valueStr = '[...]';
        // eslint-disable-next-line no-null/no-null
    } else if (typeof value === 'object' && value !== undefined && value !== null) {
        valueStr = '{...}';
    } else {
        valueStr = String(value);
    }

    // Apply total length limit
    if (valueStr.length > MAX_TOTAL_LENGTH) {
        return valueStr.substring(0, MAX_TOTAL_LENGTH - 3) + '...';
    }
    return valueStr;
}
