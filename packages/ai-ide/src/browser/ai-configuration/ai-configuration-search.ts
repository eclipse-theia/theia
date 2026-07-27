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

import { AiConfigurationSearchItem } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';

/**
 * Pure matching helpers for the tree-level (deep) search. Kept free of any DOM
 * or DI dependency so both the search widget and the tree filter reuse it and it
 * can be unit-tested in isolation.
 *
 * Match semantics: every whitespace-separated term of the query must appear in
 * the item's match key (`label + keywords + typeLabel`, lower-cased).
 */
export namespace AiConfigurationSearch {

    /** Maximum number of results shown in the deep-search dropdown. */
    export const MAX_RESULTS = 14;

    /** The lower-cased text a search item is matched against. */
    export function matchKey(item: AiConfigurationSearchItem): string {
        return `${item.label} ${item.keywords ?? ''} ${item.typeLabel}`.toLowerCase();
    }

    /** Splits a query into lower-cased, non-empty terms. */
    export function terms(query: string): string[] {
        return query.trim().toLowerCase().split(/\s+/).filter(term => term.length > 0);
    }

    /** Returns whether every term is present in `key`. */
    export function matchesTerms(key: string, searchTerms: string[]): boolean {
        return searchTerms.every(term => key.includes(term));
    }

    /**
     * Returns the items matching `query`, in index order, capped at `limit`.
     * An empty (or whitespace-only) query yields no results.
     */
    export function match(items: readonly AiConfigurationSearchItem[], query: string, limit: number = MAX_RESULTS): AiConfigurationSearchItem[] {
        const searchTerms = terms(query);
        if (searchTerms.length === 0) {
            return [];
        }
        const results: AiConfigurationSearchItem[] = [];
        for (const item of items) {
            if (matchesTerms(matchKey(item), searchTerms)) {
                results.push(item);
                if (results.length >= limit) {
                    break;
                }
            }
        }
        return results;
    }
}
