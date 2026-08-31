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
 * Extracts a string field value from potentially incomplete JSON.
 * Uses JSON.parse for complete JSON, and regex extraction for streaming scenarios.
 */
export function extractJsonStringField(json: string | undefined, fieldName: string): string | undefined {
    if (!json) {
        return undefined;
    }
    // This is called repeatedly while tool call arguments stream in, where the JSON is truncated:
    // JSON.parse would scan the whole string only to throw, which gets quadratic as the arguments
    // grow (noticeable with large payloads such as whole-file writes). An arguments object is only
    // complete once it ends with '}', so attempt the exact parse just then and use the regex otherwise.
    const trimmed = json.trim();
    if (!trimmed.startsWith('{') || trimmed.endsWith('}')) {
        try {
            const parsed = JSON.parse(json);
            if (parsed && typeof parsed === 'object' && fieldName in parsed && typeof parsed[fieldName] === 'string') {
                return parsed[fieldName];
            }
            return undefined;
        } catch {
            // fall through to the regex extraction
        }
    }
    const regex = new RegExp('"' + fieldName + '"\\s*:\\s*"([^"]*)"?');
    const match = regex.exec(json);
    return match?.[1];
}
