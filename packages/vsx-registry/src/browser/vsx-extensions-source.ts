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

import { injectable, inject, postConstruct, named } from '@theia/core/shared/inversify';
import { TreeElement, TreeSource } from '@theia/core/lib/browser/source-tree';
import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { PreferenceService } from '@theia/core/lib/common/preferences/preference-service';
import { FuzzySearch } from '@theia/core/lib/common/fuzzy-search';
import { VSXExtensionsModel } from './vsx-extensions-model';
import { ExtensionsSourceContribution, SearchContext } from './extensions-source-contribution';
import { VSXExtensionsSearchModel } from './vsx-extensions-search-model';
import debounce = require('@theia/core/shared/lodash.debounce');

@injectable()
export class VSXExtensionsSourceOptions {
    static INSTALLED = 'installed';
    static BUILT_IN = 'builtin';
    static SEARCH_RESULT = 'searchResult';
    static RECOMMENDED = 'recommended';
    readonly id: string;
}

@injectable()
export class VSXExtensionsSource extends TreeSource {

    @inject(VSXExtensionsSourceOptions)
    protected readonly options: VSXExtensionsSourceOptions;

    @inject(VSXExtensionsModel)
    protected readonly model: VSXExtensionsModel;

    @inject(ContributionProvider) @named(ExtensionsSourceContribution)
    protected readonly contributions: ContributionProvider<ExtensionsSourceContribution>;

    @inject(VSXExtensionsSearchModel)
    protected readonly searchModel: VSXExtensionsSearchModel;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(FuzzySearch)
    protected readonly fuzzySearch: FuzzySearch;

    @postConstruct()
    protected init(): void {
        this.fireDidChange();
        for (const contribution of this.contributions.getContributions()) {
            this.toDispose.push(contribution.onDidChange(() => this.scheduleFireDidChange()));
        }
        // The query carries both the search text and the per-contribution-type filter (via
        // `@`-prefixed tokens), so any query change must re-collect the entries.
        this.toDispose.push(this.searchModel.onDidChangeQuery(() => this.scheduleFireDidChange()));
    }

    protected scheduleFireDidChange = debounce(() => this.fireDidChange(), 100, { leading: false, trailing: true });

    getModel(): VSXExtensionsModel {
        return this.model;
    }

    async getElements(): Promise<IterableIterator<TreeElement>> {
        const ordered = [...this.contributions.getContributions()]
            .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
        // Apply the type-token filter to every section, not just search results, so the two
        // filtering mechanisms compose (e.g. `@installed @mcp` only lists installed MCP servers).
        const enabled = ordered.filter(c => this.searchModel.isTokenEnabled(c.searchToken));

        if (this.options.id === VSXExtensionsSourceOptions.SEARCH_RESULT) {
            return this.collectSearchResults(enabled);
        }

        const entries: TreeElement[] = [];
        for (const contribution of enabled) {
            const iter = await this.resolveForSection(contribution);
            if (!iter) {
                continue;
            }
            for (const entry of iter) {
                entries.push(entry);
            }
        }
        return entries.values();
    }

    /**
     * Sort the combined hits globally by fuzzy match so the best results surface first
     * regardless of which contribution produced them.
     */
    protected async collectSearchResults(contributions: ExtensionsSourceContribution[]): Promise<IterableIterator<TreeElement>> {
        // Contributions only see the free-text portion of the query - the `@`-prefixed mode and
        // type tokens have already been consumed by `parseQuery` to pick the mode and the
        // contribution filter, so they would otherwise leak into substring matching.
        const { freeText } = this.searchModel.parseQuery();
        const ctx: SearchContext = {
            verifiedOnly: this.preferenceService.get<boolean>('extensions.onlyShowVerifiedExtensions', false)
        };
        const results = await Promise.all(contributions.map(c => c.resolveSearchResults?.(freeText, ctx) ?? []));
        const all = results.flatMap(r => [...r]);
        const trimmed = freeText.trim();
        if (!trimmed || all.length <= 1) {
            return all.map(r => r.element).values();
        }
        const matches = await this.fuzzySearch.filter({
            pattern: trimmed,
            items: all,
            transform: r => r.searchableText
        });
        return matches.map(m => m.item.element).values();
    }

    protected async resolveForSection(contribution: ExtensionsSourceContribution): Promise<Iterable<TreeElement> | undefined> {
        switch (this.options.id) {
            case VSXExtensionsSourceOptions.INSTALLED:
                return contribution.resolveInstalled?.();
            case VSXExtensionsSourceOptions.RECOMMENDED:
                return contribution.resolveRecommended?.();
            case VSXExtensionsSourceOptions.BUILT_IN:
                return contribution.resolveBuiltIn?.();
        }
        return undefined;
    }
}
