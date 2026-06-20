// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
 * Returns the index of the first case-insensitive substring match of `pattern` in `text`,
 * or `-1` if `pattern` is not a substring. Returns `0` for an empty pattern.
 */
export function findSubstringIndex(text: string, pattern: string): number {
    if (!pattern) { return 0; }
    return text.toLowerCase().indexOf(pattern.toLowerCase());
}

export function hasSubstringMatch(text: string, pattern: string): boolean {
    return findSubstringIndex(text, pattern) !== -1;
}

const SEGMENT_SEPARATOR = /[\p{P}\s]+/u;

/**
 * Tests whether `pattern` is a "prefix match" for `text`, accounting for punctuation-separated segments.
 *
 * The pattern is split on punctuation into query parts. The text is split on punctuation into segments.
 * It is a prefix match when the first query part matches the start of segment 0, and each subsequent
 * query part matches the start of a later segment, in order.
 *
 * Examples:
 * - `hasPrefixMatch("workspace-server", "works-ser")` → true
 * - `hasPrefixMatch("backend-workspace-service", "works-ser")` → false (first segment doesn't match)
 * - `hasPrefixMatch("fontSize", "font")` → true (single-part prefix)
 */
export function hasPrefixMatch(text: string, pattern: string): boolean {
    if (!pattern) { return true; }
    const queryParts = pattern.toLowerCase().split(SEGMENT_SEPARATOR).filter(Boolean);
    if (queryParts.length === 0) { return true; }
    const textSegments = text.toLowerCase().split(SEGMENT_SEPARATOR).filter(Boolean);
    if (textSegments.length === 0) { return false; }
    // First query part must match the start of the first text segment.
    if (!textSegments[0].startsWith(queryParts[0])) { return false; }
    let segIdx = 1;
    for (let qIdx = 1; qIdx < queryParts.length; qIdx++) {
        let found = false;
        while (segIdx < textSegments.length) {
            if (textSegments[segIdx].startsWith(queryParts[qIdx])) {
                segIdx++;
                found = true;
                break;
            }
            segIdx++;
        }
        if (!found) { return false; }
    }
    return true;
}

/**
 * Returns a numeric rank for how well `pattern` matches `text`:
 * - 0: prefix match (best)
 * - 1: substring match
 * - 2: fuzzy-only match (worst)
 */
export function matchRank(text: string, pattern: string): number {
    if (hasPrefixMatch(text, pattern)) { return 0; }
    if (hasSubstringMatch(text, pattern)) { return 1; }
    return 2;
}
