/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable } from 'inversify';
import {
    QuickOpenModel, QuickOpenItem, QuickOpenMode, PrefixQuickOpenService,
    OpenerService, KeybindingRegistry, QuickOpenGroupItem, QuickOpenGroupItemOptions, QuickOpenItemOptions, QuickOpenHandler, QuickOpenOptions, Keybinding
} from '@theia/core/lib/browser';
import { FileSystem } from '@theia/filesystem/lib/common/filesystem';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import URI from '@theia/core/lib/common/uri';
import { FileSearchService } from '../common/file-search-service';
import { CancellationTokenSource } from '@theia/core/lib/common';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { Command } from '@theia/core/lib/common';
import { NavigationLocationService } from '@theia/editor/lib/browser/navigation/navigation-location-service';
import * as fuzzy from 'fuzzy';
import { MessageService } from '@theia/core/lib/common/message-service';

export const quickFileOpen: Command = {
    id: 'file-search.openFile',
    category: 'File',
    label: 'Open File...'
};

@injectable()
export class QuickFileOpenService implements QuickOpenModel, QuickOpenHandler {

    @inject(KeybindingRegistry)
    protected readonly keybindingRegistry: KeybindingRegistry;
    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    @inject(OpenerService)
    protected readonly openerService: OpenerService;
    @inject(PrefixQuickOpenService)
    protected readonly quickOpenService: PrefixQuickOpenService;
    @inject(FileSearchService)
    protected readonly fileSearchService: FileSearchService;
    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;
    @inject(NavigationLocationService)
    protected readonly navigationLocationService: NavigationLocationService;
    @inject(MessageService)
    protected readonly messageService: MessageService;

    /**
     * Whether to hide .gitignored (and other ignored) files.
     */
    protected hideIgnoredFiles: boolean = true;

    /**
     * Whether the dialog is currently open.
     */
    protected isOpen: boolean = false;

    /**
     * The current lookFor string input by the user.
     */
    protected currentLookFor: string = '';

    readonly prefix: string = '...';

    get description(): string {
        return 'Open File';
    }

    getModel(): QuickOpenModel {
        return this;
    }

    getOptions(): QuickOpenOptions {
        let placeholder = 'File name to search.';
        const keybinding = this.getKeyCommand();
        if (keybinding) {
            placeholder += ` (Press ${keybinding} to show/hide ignored files)`;
        }
        return {
            placeholder,
            fuzzyMatchLabel: {
                enableSeparateSubstringMatching: true
            },
            fuzzyMatchDescription: {
                enableSeparateSubstringMatching: true
            },
            showItemsWithoutHighlight: true,
            onClose: () => {
                this.isOpen = false;
                this.cancelIndicator.cancel();
            }
        };
    }

    isEnabled(): boolean {
        return this.workspaceService.opened;
    }

    open(): void {
        // Triggering the keyboard shortcut while the dialog is open toggles
        // showing the ignored files.
        if (this.isOpen) {
            this.hideIgnoredFiles = !this.hideIgnoredFiles;
        } else {
            this.hideIgnoredFiles = true;
            this.currentLookFor = '';
            this.isOpen = true;
        }

        this.quickOpenService.open(this.currentLookFor);
    }

    /**
     * Get a string (suitable to show to the user) representing the keyboard
     * shortcut used to open the quick file open menu.
     */
    protected getKeyCommand(): string | undefined {
        const keyCommand = this.keybindingRegistry.getKeybindingsForCommand(quickFileOpen.id);
        if (keyCommand) {
            // We only consider the first keybinding.
            const accel = Keybinding.acceleratorFor(keyCommand[0], '+');
            return accel.join(' ');
        }

        return undefined;
    }

    private cancelIndicator = new CancellationTokenSource();

    public async onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): Promise<void> {
        this.cancelIndicator.cancel();
        this.cancelIndicator = new CancellationTokenSource();
        const token = this.cancelIndicator.token;

        const roots = this.workspaceService.tryGetRoots();
        if (roots.length === 0) {
            return;
        }

        this.currentLookFor = lookFor;
        const alreadyCollected = new Set<string>();
        const recentlyUsedItems: QuickOpenItem[] = [];

        const locations = [...this.navigationLocationService.locations()].reverse();
        for (const location of locations) {
            const uriString = location.uri.toString();
            if (location.uri.scheme === 'file' && !alreadyCollected.has(uriString) && fuzzy.test(lookFor, uriString)) {
                const item = await this.toItem(location.uri, { groupLabel: recentlyUsedItems.length === 0 ? 'recently opened' : undefined, showBorder: false });
                if (token.isCancellationRequested) {
                    return;
                }
                recentlyUsedItems.push(item);
                alreadyCollected.add(uriString);
            }
        }
        if (lookFor.length > 0) {
            const handler = async (results: string[]) => {
                if (token.isCancellationRequested) {
                    return;
                }
                const fileSearchResultItems: QuickOpenItem[] = [];
                for (const fileUri of results) {
                    if (!alreadyCollected.has(fileUri)) {
                        const item = await this.toItem(fileUri);
                        if (token.isCancellationRequested) {
                            return;
                        }
                        fileSearchResultItems.push(item);
                        alreadyCollected.add(fileUri);
                    }
                }

                // Create a copy of the file search results and sort.
                const sortedResults = fileSearchResultItems.slice();
                sortedResults.sort((a, b) => this.compareItems(a, b));

                // Extract the first element, and re-add it to the array with the group label.
                const first = sortedResults[0];
                sortedResults.shift();
                if (first) {
                    const item = await this.toItem(first.getUri()!, { groupLabel: 'file results', showBorder: true });
                    if (token.isCancellationRequested) {
                        return;
                    }
                    sortedResults.unshift(item);
                }
                // Return the recently used items, followed by the search results.
                acceptor([...recentlyUsedItems, ...sortedResults]);
            };
            this.fileSearchService.find(lookFor, {
                rootUris: roots.map(r => r.uri),
                fuzzyMatch: true,
                limit: 200,
                useGitIgnore: this.hideIgnoredFiles,
            }, token).then(handler);
        } else {
            acceptor(recentlyUsedItems);
        }
    }

    protected getRunFunction(uri: URI) {
        return (mode: QuickOpenMode) => {
            if (mode !== QuickOpenMode.OPEN) {
                return false;
            }
            this.openFile(uri);
            return true;
        };
    }

    /**
     * Compare two `QuickOpenItem`.
     *
     * @param a `QuickOpenItem` for comparison.
     * @param b `QuickOpenItem` for comparison.
     * @param member the `QuickOpenItem` object member for comparison.
     */
    protected compareItems(
        a: QuickOpenItem<QuickOpenItemOptions>,
        b: QuickOpenItem<QuickOpenItemOptions>,
        member: 'getLabel' | 'getUri' = 'getLabel'): number {

        /**
         * Normalize a given string.
         *
         * @param str the raw string value.
         * @returns the normalized string value.
         */
        function normalize(str: string) {
            return str.trim().toLowerCase();
        }

        // Normalize the user query.
        const query: string = normalize(this.currentLookFor);

        /**
         * Score a given string.
         *
         * @param str the string to score on.
         * @returns the score.
         */
        function score(str: string): number {
            const match = fuzzy.match(query, str);
            return (match === null) ? 0 : match.score;
        }

        // Get the item's member values for comparison.
        let itemA = a[member]()!;
        let itemB = b[member]()!;

        // If the `URI` is used as a comparison member, perform the necessary string conversions.
        if (typeof itemA !== 'string') {
            itemA = itemA.path.toString();
        }
        if (typeof itemB !== 'string') {
            itemB = itemB.path.toString();
        }

        // Normalize the item labels.
        itemA = normalize(itemA);
        itemB = normalize(itemB);

        // Score the item labels.
        const scoreA: number = score(itemA);
        const scoreB: number = score(itemB);

        // If both label scores are identical, perform additional computation.
        if (scoreA === scoreB) {

            // Favor the label which have the smallest substring index.
            const indexA: number = itemA.indexOf(query);
            const indexB: number = itemB.indexOf(query);

            if (indexA === indexB) {

                // Favor the result with the shortest label length.
                if (itemA.length !== itemB.length) {
                    return (itemA.length < itemB.length) ? -1 : 1;
                }

                // Fallback to the alphabetical order.
                const comparison = itemB.localeCompare(itemA);

                // If the alphabetical comparison is equal, call `compareItems` recursively using the `URI` member instead.
                if (comparison === 0) {
                    return this.compareItems(a, b, 'getUri');
                }

                return itemB.localeCompare(itemA);
            }

            return indexA - indexB;
        }

        return scoreB - scoreA;
    }

    openFile(uri: URI): void {
        this.openerService.getOpener(uri)
            .then(opener => opener.open(uri))
            .catch(error => this.messageService.error(error));
    }

    private async toItem(uriOrString: URI | string, group?: QuickOpenGroupItemOptions) {
        const uri = uriOrString instanceof URI ? uriOrString : new URI(uriOrString);
        let description = this.labelProvider.getLongName(uri.parent);
        if (this.workspaceService.workspace && !this.workspaceService.workspace.isDirectory) {
            const rootUri = this.workspaceService.getWorkspaceRootUri(uri);
            if (rootUri) {
                description = `${rootUri.displayName} • ${description}`;
            }
        }
        const options: QuickOpenItemOptions = {
            label: this.labelProvider.getName(uri),
            iconClass: await this.labelProvider.getIcon(uri) + ' file-icon',
            description,
            tooltip: uri.path.toString(),
            uri: uri,
            hidden: false,
            run: this.getRunFunction(uri)
        };
        if (group) {
            return new QuickOpenGroupItem<QuickOpenGroupItemOptions>({ ...options, ...group });
        } else {
            return new QuickOpenItem<QuickOpenItemOptions>(options);
        }
    }
}
