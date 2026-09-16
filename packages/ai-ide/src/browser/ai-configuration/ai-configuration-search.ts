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
 * or DI dependency so the tree filter can reuse it and it can be unit-tested in
 * isolation.
 *
 * Match semantics: every whitespace-separated term of the query must appear in
 * the item's match key (`label + keywords + typeLabel`, lower-cased).
 */
export namespace AiConfigurationSearch {

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
}
