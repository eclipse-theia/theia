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

export interface KeywordListEntry {
    name: string;
    description: string;
}

/**
 * Renders entries for a listing tool as `- <name>: <description>` lines, descriptions collapsed to one line.
 * With a query, keeps only the entries whose name or description contains any of its whitespace-separated
 * keywords (case-insensitive), the entries matching the most keywords first.
 * Returns `undefined` if no entry is left.
 */
export function listByKeywords(entries: KeywordListEntry[], query?: string): string | undefined {
    const terms = query?.toLowerCase().split(/\s+/).filter(term => term.length > 0) ?? [];
    const matches = entries
        .map(entry => {
            const text = `${entry.name} ${entry.description}`.toLowerCase();
            return { entry, hits: terms.filter(term => text.includes(term)).length };
        })
        .filter(match => terms.length === 0 || match.hits > 0)
        .sort((a, b) => b.hits - a.hits);
    if (matches.length === 0) {
        return undefined;
    }
    return matches.map(({ entry }) => `- ${entry.name}: ${entry.description.replace(/\s+/g, ' ').trim()}`).join('\n');
}
