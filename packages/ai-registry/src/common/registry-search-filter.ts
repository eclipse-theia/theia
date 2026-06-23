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

const SEGMENT_SEPARATOR = /[\p{P}\s]+/u;

function tokenize(text: string): string[] {
    return text.toLowerCase().split(SEGMENT_SEPARATOR).filter(Boolean);
}

/**
 * Reduces a registry identifier to its human-meaningful part for search matching.
 *
 * Registry identifiers are reverse-DNS ids with a path, e.g. `com.asana/mcp` or
 * `io.github.anthropics/algorithmic-art`. The leading domain labels (`com`, `io`, `github`, ...)
 * are shared boilerplate that would otherwise let a query like `git` match every `io.github.*`
 * entry. This keeps only the last domain label plus the path: `asana mcp`, `anthropics algorithmic-art`.
 *
 * Plain strings without a domain or path are returned unchanged.
 */
export function meaningfulIdentifier(identifier: string): string {
    const [domain, ...rest] = identifier.split('/');
    const lastLabel = domain.split('.').pop() || domain;
    return [lastLabel, ...rest].join(' ');
}

/**
 * Relevance filter shared by the MCP-server and skill contributions to the Extensions view.
 *
 * The shared Extensions ranker fuzzy-matches scattered characters across a combined searchable
 * text. Registry descriptions are long, keyword-rich prose, so that match treats almost every
 * entry as a hit for any short query (e.g. `asana` matching every server). This filter narrows the
 * candidate set to genuine matches before the shared ranker runs.
 *
 * An entry matches when *every* whitespace/punctuation-separated query term either:
 * - appears as a substring of the meaningful name or identifier
 *   (so `asana` matches `com.asana/mcp` and `art` matches `algorithmic-art`), or
 * - is the prefix of some word in the name, identifier or description
 *   (so `powerpoint` finds an entry whose description mentions "PowerPoint").
 */
export function matchesRegistrySearch(entry: { name: string; identifier: string; description: string }, query: string): boolean {
    const terms = tokenize(query);
    if (terms.length === 0) {
        return true;
    }
    const name = meaningfulIdentifier(entry.name).toLowerCase();
    const identifier = meaningfulIdentifier(entry.identifier).toLowerCase();
    const words = [...tokenize(name), ...tokenize(identifier), ...tokenize(entry.description)];
    return terms.every(term =>
        name.includes(term)
        || identifier.includes(term)
        || words.some(word => word.startsWith(term))
    );
}
