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

const SEGMENT_SEPARATOR = /[\p{P}\s]+/u;

/**
 * Reverse-DNS labels that host third-party owners rather than identifying one (e.g. the `github`
 * in `io.github.<owner>`). They are dropped along with the leading TLD so the owner label becomes
 * the meaningful part, while a query like `git` still can't match every `io.github.*` entry.
 */
const HOSTING_NAMESPACES = new Set(['github', 'gitlab', 'gitee', 'bitbucket']);

export interface RegistrySearchEntry {
    name: string;
    identifier: string;
    description: string;
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
 *
 * Exposed as an injectable service so adopters can rebind it to tweak search semantics for
 * their registry contributions.
 */
@injectable()
export class RegistrySearchFilter {

    matches(entry: RegistrySearchEntry, query: string): boolean {
        const terms = this.tokenize(this.reduceQuery(query));
        if (terms.length === 0) {
            return true;
        }
        const name = this.meaningfulIdentifier(entry.name).toLowerCase();
        const identifier = this.meaningfulIdentifier(entry.identifier).toLowerCase();
        const words = [...this.tokenize(name), ...this.tokenize(identifier), ...this.tokenize(entry.description)];
        return terms.every(term =>
            name.includes(term)
            || identifier.includes(term)
            || words.some(word => word.startsWith(term))
        );
    }

    /**
     * Reduces a registry identifier to its human-meaningful part for search matching.
     *
     * Registry identifiers are reverse-DNS ids with a path, e.g. `com.asana/mcp` or
     * `io.github.anthropics/algorithmic-art`. The leading TLD (`com`, `io`, ...) and any hosting
     * namespace (`github` in `io.github.<owner>`) are shared boilerplate that would otherwise let a
     * query like `git` match every `io.github.*` entry, so they are dropped. The remaining owner
     * labels plus the path are kept: `asana mcp`, `anthropics algorithmic-art`, `cloudflare mcp mcp`.
     *
     * Plain strings without a domain or path are returned unchanged.
     */
    meaningfulIdentifier(identifier: string): string {
        const [domain, ...rest] = identifier.split('/');
        return [...this.meaningfulDomainLabels(domain), ...rest].join(' ');
    }

    /**
     * Drops the boilerplate leading labels of a reverse-DNS domain, keeping the owner label(s).
     * A single-label string (no reverse-DNS structure) is returned as-is.
     */
    protected meaningfulDomainLabels(domain: string): string[] {
        const labels = domain.split('.');
        if (labels.length <= 1) {
            return labels;
        }
        labels.shift(); // drop the leading TLD label (io, com, app, ai, ...)
        // Drop a hosting namespace like `github` in `io.github.<owner>`, but only when an owner
        // label still follows it - otherwise the owner itself would be discarded (e.g. `com.gitlab`).
        if (labels.length > 1 && HOSTING_NAMESPACES.has(labels[0].toLowerCase())) {
            labels.shift();
        }
        return labels;
    }

    /**
     * Reduces a query shaped like a registry id (reverse-DNS domain with a `/` path) the same way
     * entry identifiers are reduced, so the full id - e.g. copied from the registry website or set
     * by the "From registry" link - finds the server instead of being rejected by the stripped
     * boilerplate labels it would otherwise require as terms. Plain-text queries are left untouched.
     */
    protected reduceQuery(query: string): string {
        return query.includes('/') ? this.meaningfulIdentifier(query) : query;
    }

    protected tokenize(text: string): string[] {
        return text.toLowerCase().split(SEGMENT_SEPARATOR).filter(Boolean);
    }
}
