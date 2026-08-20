// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common/event';
import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { ExtensionsSourceContribution } from './extensions-source-contribution';

export enum VSXSearchMode {
    Initial,
    None,
    Search,
    Installed,
    Builtin,
    Recommended,
}

export const BUILTIN_QUERY = '@builtin';
export const INSTALLED_QUERY = '@installed';
export const RECOMMENDED_QUERY = '@recommended';

/** Mutually-exclusive mode tokens, in the order they are checked when parsing the query. */
export const MODE_QUERIES: readonly string[] = [INSTALLED_QUERY, BUILTIN_QUERY, RECOMMENDED_QUERY];

/**
 * Outcome of {@link VSXExtensionsSearchModel.parseQuery}: the query, decomposed into the (single)
 * search mode driven by `@installed`/`@builtin`/`@recommended`, the per-contribution type tokens
 * (e.g. `@mcp`), and the free-text remainder used as the actual search term.
 */
export interface ParsedQuery {
    /** Search mode the view container uses to pick which widget is visible. */
    readonly mode: VSXSearchMode;
    /** Contribution `searchToken`s present in the query. Empty means "all contributions are enabled". */
    readonly typeTokens: ReadonlySet<string>;
    /** Everything in the query that isn't a recognised mode or type token. */
    readonly freeText: string;
}

@injectable()
export class VSXExtensionsSearchModel {

    @inject(ContributionProvider) @named(ExtensionsSourceContribution)
    protected readonly contributions: ContributionProvider<ExtensionsSourceContribution>;

    protected readonly onDidChangeQueryEmitter = new Emitter<string>();
    readonly onDidChangeQuery = this.onDidChangeQueryEmitter.event;

    protected readonly modeForToken = new Map<string, VSXSearchMode>([
        [BUILTIN_QUERY, VSXSearchMode.Builtin],
        [INSTALLED_QUERY, VSXSearchMode.Installed],
        [RECOMMENDED_QUERY, VSXSearchMode.Recommended],
    ]);

    protected _query = '';
    set query(query: string) {
        if (this._query === query) {
            return;
        }
        this._query = query;
        this.onDidChangeQueryEmitter.fire(this._query);
    }
    get query(): string {
        return this._query;
    }

    /**
     * Parses the current query into its mode, type-token and free-text parts. Both mode and type
     * tokens compose, so `@installed @mcp asana` parses to `{ mode: Installed, typeTokens: {@mcp},
     * freeText: 'asana' }`.
     */
    parseQuery(): ParsedQuery {
        const validTypeTokens = this.getRegisteredTypeTokens();
        let mode: VSXSearchMode | undefined;
        const typeTokens = new Set<string>();
        const freeTextParts: string[] = [];
        for (const token of this._query.split(/\s+/).filter(Boolean)) {
            // Mode tokens are mutually exclusive: the first wins. A second mode token in the same
            // query is treated as free text so users don't end up in an ambiguous state.
            if (mode === undefined && this.modeForToken.has(token)) {
                mode = this.modeForToken.get(token);
                continue;
            }
            if (validTypeTokens.has(token)) {
                typeTokens.add(token);
                continue;
            }
            freeTextParts.push(token);
        }
        const freeText = freeTextParts.join(' ');
        if (mode === undefined) {
            mode = freeText.length > 0 ? VSXSearchMode.Search : VSXSearchMode.None;
        }
        return { mode, typeTokens, freeText };
    }

    /** Convenience for the view container, which only needs the mode. */
    getModeForQuery(): VSXSearchMode {
        return this.parseQuery().mode;
    }

    /**
     * True when the given contribution `searchToken` should be considered enabled for the current
     * query. When no type tokens are present, all contributions are enabled.
     */
    isTokenEnabled(token: string): boolean {
        const { typeTokens } = this.parseQuery();
        return typeTokens.size === 0 || typeTokens.has(token);
    }

    /** Set of `searchToken`s contributed by the currently registered extensions sources. */
    getRegisteredTypeTokens(): ReadonlySet<string> {
        const tokens = new Set<string>();
        for (const contribution of this.contributions.getContributions()) {
            tokens.add(contribution.searchToken);
        }
        return tokens;
    }
}
