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

import { Event } from '@theia/core/lib/common/event';
import { TreeElement } from '@theia/core/lib/browser/source-tree';

export const ExtensionsSourceContribution = Symbol('ExtensionsSourceContribution');

/**
 * Context passed to `resolveSearchResults` so contributions can honour the search
 * bar's "only show verified" toggle (and any future filters added there).
 */
export interface SearchContext {
    /**
     * Toggled by the `extensions.onlyShowVerifiedExtensions` preference. The preference
     * was introduced to filter the OVSX result set down to namespace-verified publishers,
     * but the same flag also drives "verified" filters in other contributions - each one
     * decides what "verified" means in its domain (e.g. `@theia/ai-registry` reads it as
     * "approved in the AI registry"). Document this domain mapping next to any consumer.
     */
    readonly verifiedOnly: boolean;
}

/**
 * A search hit produced by a contribution. The view collects these from all
 * contributions and orders them globally by fuzzy-match against the current
 * query, so the most relevant hits surface first regardless of which
 * contribution produced them.
 */
export interface SearchResult {
    readonly element: TreeElement;
    /**
     * Text the global fuzzy matcher should consider when ranking this entry -
     * typically a concatenation of the entry's most distinctive fields
     * (name, identifier, description, etc.). Contributions are encouraged to
     * include anything the user might plausibly have searched for.
     */
    readonly searchableText: string;
}

/**
 * Contribution point for the Extensions view. Each contribution represents one
 * artifact type (e.g. `extension`, `mcp-server`, future `skill`) and supplies
 * entries to the relevant sections of the view.
 *
 * Contributions implement only the modes they participate in. A contribution
 * that has no concept of "built-in", for example, simply omits `resolveBuiltIn`.
 *
 * Each returned `TreeElement` carries its own `render(host)` - the contribution
 * controls how its entries look. The view groups results by contribution type
 * (using `displayName` as the group header) when more than one contribution
 * yields entries for a section.
 */
export interface ExtensionsSourceContribution {
    /** Stable, machine-readable identifier for the artifact type. */
    readonly type: string;

    /** Human-readable label used as the group header in the view. */
    readonly displayName: string;

    /** Ordering hint when multiple contributions yield entries for the same section. Lower numbers come first. Defaults to 0. */
    readonly priority?: number;

    /** Fired when the contribution's entries change (e.g. after install, refresh, or preference update). */
    readonly onDidChange: Event<void>;

    /** Entries for the "Installed" section. Omit if this type has no installed concept. */
    resolveInstalled?(): Iterable<TreeElement> | Promise<Iterable<TreeElement>>;

    /**
     * Entries matching a user search. Each result carries its own `searchableText`
     * so the view can rank hits from all contributions against a single query.
     * Omit if this type does not participate in search.
     *
     * Contributions may ignore `query` when their internal state already reflects the
     * current query (e.g. the VSX adapter, whose model is kept in sync with the search
     * bar via the singleton `VSXExtensionsSearchModel`). In that case the contribution
     * is expected to yield its current result set and let the view's cross-contribution
     * fuzzy ranker handle the actual ordering.
     */
    resolveSearchResults?(query: string, context: SearchContext): Iterable<SearchResult> | Promise<Iterable<SearchResult>>;

    /** Entries for the "Recommended" section. Omit if this type has no recommendations. */
    resolveRecommended?(): Iterable<TreeElement> | Promise<Iterable<TreeElement>>;

    /** Entries for the "Built-in" section. Omit if this type has no built-ins. */
    resolveBuiltIn?(): Iterable<TreeElement> | Promise<Iterable<TreeElement>>;

    /**
     * Called when the user triggers a refresh on the view toolbar. Contributions
     * should re-fetch any remote state and fire `onDidChange` once new data is
     * available. Optional - contributions without remote data can omit this.
     */
    refresh?(): Promise<void>;
}
