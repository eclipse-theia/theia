// *****************************************************************************
// Copyright (C) 2019 Ericsson and others.
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

import { nls } from '@theia/core/lib/common/nls';
import { PreferenceSchema, PreferenceProxy, PreferenceService, createPreferenceProxy, PreferenceContribution } from '@theia/core/lib/browser/preferences';
import { interfaces } from '@theia/core/shared/inversify';

export const searchInWorkspacePreferencesSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        'search.lineNumbers': {
            description: nls.localizeByDefault('Controls whether to show line numbers for search results.'),
            default: false,
            type: 'boolean',
        },
        'search.collapseResults': {
            description: nls.localizeByDefault('Controls whether the search results will be collapsed or expanded.'),
            default: 'auto',
            type: 'string',
            enum: ['auto', 'alwaysCollapse', 'alwaysExpand'],
        },
        'search.quickOpen.includeHistory': {
            description: nls.localizeByDefault('Whether to include results from recently opened files in the file results for Quick Open.'),
            default: true,
            type: 'boolean',
        },
        'search.searchOnType': {
            description: nls.localizeByDefault('Search all files as you type.'),
            default: true,
            type: 'boolean',
        },
        'search.searchOnTypeDebouncePeriod': {
            // eslint-disable-next-line max-len
            markdownDescription: nls.localizeByDefault('When {0} is enabled, controls the timeout in milliseconds between a character being typed and the search starting. Has no effect when {0} is disabled.', '`#search.searchOnType#`'),
            default: 300,
            type: 'number',
        },
        'search.searchOnEditorModification': {
            description: nls.localize('theia/search-in-workspace/searchOnEditorModification', 'Search the active editor when modified.'),
            default: true,
            type: 'boolean',
        },
        'search.smartCase': {
            // eslint-disable-next-line max-len
            description: nls.localizeByDefault('Search case-insensitively if the pattern is all lowercase, otherwise, search case-sensitively.'),
            default: false,
            type: 'boolean',
        },
        'search.followSymlinks': {
            description: nls.localizeByDefault('Controls whether to follow symlinks while searching.'),
            default: true,
            type: 'boolean',
        }
    }
};

export class SearchInWorkspaceConfiguration {
    'search.lineNumbers': boolean;
    'search.collapseResults': string;
    'search.searchOnType': boolean;
    'search.searchOnTypeDebouncePeriod': number;
    'search.searchOnEditorModification': boolean;
    'search.smartCase': boolean;
    'search.followSymlinks': boolean;
}

export const SearchInWorkspacePreferenceContribution = Symbol('SearchInWorkspacePreferenceContribution');
export const SearchInWorkspacePreferences = Symbol('SearchInWorkspacePreferences');
export type SearchInWorkspacePreferences = PreferenceProxy<SearchInWorkspaceConfiguration>;

export function createSearchInWorkspacePreferences(preferences: PreferenceService, schema: PreferenceSchema = searchInWorkspacePreferencesSchema): SearchInWorkspacePreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindSearchInWorkspacePreferences(bind: interfaces.Bind): void {
    bind(SearchInWorkspacePreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(SearchInWorkspacePreferenceContribution);
        return createSearchInWorkspacePreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(SearchInWorkspacePreferenceContribution).toConstantValue({ schema: searchInWorkspacePreferencesSchema });
    bind(PreferenceContribution).toService(SearchInWorkspacePreferenceContribution);
}
