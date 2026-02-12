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
 * Represents a parsed capability variable from a prompt template.
 */
export interface ParsedCapability {
    /** The fragment ID to resolve when the capability is enabled */
    fragmentId: string;
    /** Whether the capability is enabled by default */
    defaultEnabled: boolean;
}

/**
 * Regular expressions for matching capability variables in prompt templates.
 * Supports both double brace {{capability:...}} and triple brace {{{capability:...}}} syntax.
 */
const CAPABILITY_TWO_BRACES_REGEX = /\{\{\s*capability:([^\s}]+)\s+default\s+(on|off)\s*\}\}/gi;
const CAPABILITY_THREE_BRACES_REGEX = /\{\{\{\s*capability:([^\s}]+)\s+default\s+(on|off)\s*\}\}\}/gi;

/**
 * Parses capability variables from a prompt template string.
 *
 * Capability variables have the format:
 * - `{{capability:fragment-id default on}}` or `{{capability:fragment-id default off}}`
 * - `{{{capability:fragment-id default on}}}` or `{{{capability:fragment-id default off}}}`
 *
 * @param template The prompt template string to parse
 * @returns Array of parsed capabilities in the order they appear in the template
 */
export function parseCapabilitiesFromTemplate(template: string): ParsedCapability[] {
    const seenFragmentIds = new Set<string>();

    // Process both two-brace and three-brace patterns
    // We need to find all matches first, then sort by their position in the template
    const allMatches: { index: number; fragmentId: string; defaultEnabled: boolean }[] = [];

    // Collect all matches with their positions
    CAPABILITY_TWO_BRACES_REGEX.lastIndex = 0;
    let match = CAPABILITY_TWO_BRACES_REGEX.exec(template);
    while (match) {
        allMatches.push({
            index: match.index,
            fragmentId: match[1],
            defaultEnabled: match[2].toLowerCase() === 'on'
        });
        match = CAPABILITY_TWO_BRACES_REGEX.exec(template);
    }

    CAPABILITY_THREE_BRACES_REGEX.lastIndex = 0;
    match = CAPABILITY_THREE_BRACES_REGEX.exec(template);
    while (match) {
        allMatches.push({
            index: match.index,
            fragmentId: match[1],
            defaultEnabled: match[2].toLowerCase() === 'on'
        });
        match = CAPABILITY_THREE_BRACES_REGEX.exec(template);
    }

    // Sort by position in template
    allMatches.sort((a, b) => a.index - b.index);

    // Add unique capabilities in order
    const capabilities: ParsedCapability[] = [];
    for (const m of allMatches) {
        if (!seenFragmentIds.has(m.fragmentId)) {
            seenFragmentIds.add(m.fragmentId);
            capabilities.push({
                fragmentId: m.fragmentId,
                defaultEnabled: m.defaultEnabled
            });
        }
    }

    return capabilities;
}
