// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { KeybindingRegistry, OpenerService, PreferenceService, QuickAccessRegistry } from '@theia/core/lib/browser';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { findMatches, QuickInputService, QuickPickItem, QuickPicks } from '@theia/core/lib/browser/quick-input/quick-input-service';
import { CancellationToken, nls, QuickPickSeparator } from '@theia/core/lib/common';
import { MessageService } from '@theia/core/lib/common/message-service';
import URI from '@theia/core/lib/common/uri';
import * as fuzzy from '@theia/core/shared/fuzzy';
import { inject, injectable, optional } from '@theia/core/shared/inversify';
import { Position, Range } from '@theia/editor/lib/browser';
import { NavigationLocationService } from '@theia/editor/lib/browser/navigation/navigation-location-service';
import { FileSystemPreferences } from '@theia/filesystem/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { FileSearchService, WHITESPACE_QUERY_SEPARATOR } from '../common/file-search-service';

export interface FilterAndRange {
    filter: string;
    range?: Range;
}

export interface QuickFileSelectOptions {
    /** Whether to hide .gitignored (and other ignored) files. */
    hideIgnoredFiles?: boolean;
    /** Executed when the item is selected. */
    onSelect?: (item: FileQuickPickItem) => void;
}

// Supports patterns of <path><#|:><line><#|:|,><col?>
const LINE_COLON_PATTERN = /\s?[#:\(](?:line )?(\d*)(?:[#:,](\d*))?\)?\s*$/;
export type FileQuickPickItem = QuickPickItem & { uri: URI };

export namespace FileQuickPickItem {
    export function is(obj: QuickPickItem | QuickPickSeparator): obj is FileQuickPickItem {
        return obj && 'uri' in obj;
    }
}

@injectable()
export class QuickFileSelectService {

    @inject(KeybindingRegistry)
    protected readonly keybindingRegistry: KeybindingRegistry;
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    @inject(OpenerService)
    protected readonly openerService: OpenerService;
    @inject(QuickInputService) @optional()
    protected readonly quickInputService: QuickInputService;
    @inject(QuickAccessRegistry)
    protected readonly quickAccessRegistry: QuickAccessRegistry;
    @inject(FileSearchService)
    protected readonly fileSearchService: FileSearchService;
    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;
    @inject(NavigationLocationService)
    protected readonly navigationLocationService: NavigationLocationService;
    @inject(MessageService)
    protected readonly messageService: MessageService;
    @inject(FileSystemPreferences)
    protected readonly fsPreferences: FileSystemPreferences;
    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    /**
     * The score constants when comparing file search results.
     */
    private static readonly Scores = {
        max: 1000,  // represents the maximum score from fuzzy matching (Infinity).
        exact: 500, // represents the score assigned to exact matching.
        partial: 250 // represents the score assigned to partial matching.
    };

    async getPicks(
        fileFilter: string = '',
        token: CancellationToken = CancellationToken.None,
        options: QuickFileSelectOptions = {
            hideIgnoredFiles: true
        }
    ): Promise<QuickPicks> {
        const roots = this.workspaceService.tryGetRoots();

        const alreadyCollected = new Set<string>();
        const recentlyUsedItems: QuickPicks = [];

        if (this.preferences.get('search.quickOpen.includeHistory')) {
            const locations = [...this.navigationLocationService.locations()].reverse();
            for (const location of locations) {
                const uriString = location.uri.toString();

                if (location.uri.scheme === 'file' && !alreadyCollected.has(uriString) && fuzzy.test(fileFilter, uriString)) {
                    if (recentlyUsedItems.length === 0) {
                        recentlyUsedItems.push({
                            type: 'separator',
                            label: nls.localizeByDefault('recently opened')
                        });
                    }
                    const item = this.toItem(fileFilter, location.uri, options.onSelect);
                    recentlyUsedItems.push(item);
                    alreadyCollected.add(uriString);
                }
            }
        }

        if (fileFilter.length > 0) {
            const handler = async (results: string[]) => {
                if (token.isCancellationRequested || results.length <= 0) {
                    return [];
                }

                const result = [...recentlyUsedItems];
                const fileSearchResultItems: FileQuickPickItem[] = [];

                for (const fileUri of results) {
                    if (!alreadyCollected.has(fileUri)) {
                        const item = this.toItem(fileFilter, fileUri, options.onSelect);
                        fileSearchResultItems.push(item);
                        alreadyCollected.add(fileUri);
                    }
                }

                // Create a copy of the file search results and sort.
                const sortedResults = fileSearchResultItems.slice();
                sortedResults.sort((a, b) => this.compareItems(a, b, fileFilter));

                if (sortedResults.length > 0) {
                    result.push({
                        type: 'separator',
                        label: nls.localizeByDefault('file results')
                    });
                    result.push(...sortedResults);
                }

                // Return the recently used items, followed by the search results.
                return result;
            };

            return this.fileSearchService.find(fileFilter, {
                rootUris: roots.map(r => r.resource.toString()),
                fuzzyMatch: true,
                limit: 200,
                useGitIgnore: options.hideIgnoredFiles,
                excludePatterns: options.hideIgnoredFiles
                    ? Object.keys(this.fsPreferences['files.exclude'])
                    : undefined,
            }, token).then(handler);
        } else {
            return roots.length !== 0 ? recentlyUsedItems : [];
        }
    }

    protected compareItems(
        left: FileQuickPickItem,
        right: FileQuickPickItem,
        fileFilter: string
    ): number {

        /**
         * Score a given string.
         *
         * @param str the string to score on.
         * @returns the score.
         */
        function score(str: string | undefined): number {
            if (!str) {
                return 0;
            }

            let exactMatch = true;
            const partialMatches = querySplit.reduce((matched, part) => {
                const partMatches = str.includes(part);
                exactMatch = exactMatch && partMatches;
                return partMatches ? matched + QuickFileSelectService.Scores.partial : matched;
            }, 0);

            // Check fuzzy matches.
            const fuzzyMatch = fuzzy.match(queryJoin, str) ?? { score: 0 };
            if (fuzzyMatch.score === Infinity && exactMatch) {
                return Number.MAX_SAFE_INTEGER;
            }

            return fuzzyMatch.score + partialMatches + (exactMatch ? QuickFileSelectService.Scores.exact : 0);
        }

        const query: string = normalize(fileFilter);
        // Adjust for whitespaces in the query.
        const querySplit = query.split(WHITESPACE_QUERY_SEPARATOR);
        const queryJoin = querySplit.join('');

        const compareByLabelScore = (l: FileQuickPickItem, r: FileQuickPickItem) => score(r.label) - score(l.label);
        const compareByLabelIndex = (l: FileQuickPickItem, r: FileQuickPickItem) => r.label.indexOf(query) - l.label.indexOf(query);
        const compareByLabel = (l: FileQuickPickItem, r: FileQuickPickItem) => l.label.localeCompare(r.label);

        const compareByPathScore = (l: FileQuickPickItem, r: FileQuickPickItem) => score(r.uri.path.toString()) - score(l.uri.path.toString());
        const compareByPathIndex = (l: FileQuickPickItem, r: FileQuickPickItem) => r.uri.path.toString().indexOf(query) - l.uri.path.toString().indexOf(query);
        const compareByPathLabel = (l: FileQuickPickItem, r: FileQuickPickItem) => l.uri.path.toString().localeCompare(r.uri.path.toString());

        return compareWithDiscriminators(left, right, compareByLabelScore, compareByLabelIndex, compareByLabel, compareByPathScore, compareByPathIndex, compareByPathLabel);
    }

    private toItem(lookFor: string, uriOrString: URI | string, onSelect?: ((item: FileQuickPickItem) => void) | undefined): FileQuickPickItem {
        const uri = uriOrString instanceof URI ? uriOrString : new URI(uriOrString);
        const label = this.labelProvider.getName(uri);
        const description = this.getItemDescription(uri);
        const iconClasses = this.getItemIconClasses(uri);

        const item = <FileQuickPickItem>{
            label,
            description,
            highlights: {
                label: findMatches(label, lookFor),
                description: findMatches(description, lookFor)
            },
            iconClasses,
            uri
        };
        return {
            ...item,
            execute: () => onSelect ? onSelect(item) : undefined
        };
    }

    private getItemIconClasses(uri: URI): string[] | undefined {
        const icon = this.labelProvider.getIcon(uri).split(' ').filter(v => v.length > 0);
        if (icon.length > 0) {
            icon.push('file-icon');
        }
        return icon;
    }

    private getItemDescription(uri: URI): string {
        return this.labelProvider.getDetails(uri);
    }

    /**
     * Splits the given expression into a structure of search-file-filter and
     * location-range.
     *
     * @param expression patterns of <path><#|:><line><#|:|,><col?>
     */
    protected splitFilterAndRange(expression: string): FilterAndRange {
        let filter = expression;
        let range = undefined;

        // Find line and column number from the expression using RegExp.
        const patternMatch = LINE_COLON_PATTERN.exec(expression);

        if (patternMatch) {
            const line = parseInt(patternMatch[1] ?? '', 10);
            if (Number.isFinite(line)) {
                const lineNumber = line > 0 ? line - 1 : 0;

                const column = parseInt(patternMatch[2] ?? '', 10);
                const startColumn = Number.isFinite(column) && column > 0 ? column - 1 : 0;
                const position = Position.create(lineNumber, startColumn);

                filter = expression.substring(0, patternMatch.index);
                range = Range.create(position, position);
            }
        }
        return { filter, range };
    }
}

/**
 * Normalize a given string.
 *
 * @param str the raw string value.
 * @returns the normalized string value.
 */
function normalize(str: string): string {
    return str.trim().toLowerCase();
}

function compareWithDiscriminators<T>(left: T, right: T, ...discriminators: ((left: T, right: T) => number)[]): number {
    let comparisonValue = 0;
    let i = 0;

    while (comparisonValue === 0 && i < discriminators.length) {
        comparisonValue = discriminators[i](left, right);
        i++;
    }
    return comparisonValue;
}
