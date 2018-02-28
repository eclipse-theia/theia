/*
 * Copyright (C) 2017-2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import URI from '@theia/core/lib/common/uri';
import { QuickOpenService, QuickOpenModel, QuickOpenItem, QuickOpenItemOptions } from '@theia/core/lib/browser/quick-open/';
import { injectable, inject } from 'inversify';
import { MenuModelRegistry, MenuContribution, CommandContribution, CommandRegistry, ILogger } from '@theia/core';
import {
    CommonMenus, QuickOpenMode, OpenerService, open, Highlight, QuickOpenOptions,
    KeybindingContribution, KeybindingRegistry
} from '@theia/core/lib/browser';
import { SearchInWorkspaceService } from './search-in-workspace-service';
import { SearchInWorkspaceResult, SearchInWorkspaceOptions } from '../common/search-in-workspace-interface';
import { Range } from '@theia/editor/lib/browser';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';

@injectable()
export class QuickSearchInWorkspace implements QuickOpenModel {
    private currentSearchId: number = -1;
    protected MAX_RESULTS = 100;

    constructor(
        @inject(QuickOpenService) protected readonly quickOpenService: QuickOpenService,
        @inject(SearchInWorkspaceService) protected readonly searchInWorkspaceService: SearchInWorkspaceService,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(LabelProvider) protected readonly labelProvider: LabelProvider,
        @inject(ILogger) protected readonly logger: ILogger,
    ) { }

    isEnabled(): boolean {
        return this.searchInWorkspaceService.isEnabled();
    }

    onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
        // If we have a search pending, it's not relevant anymore, cancel it.
        this.cancelCurrentSeach();

        if (lookFor.length === 0) {
            // The user has emptied the search box, call acceptor to
            // remove any previously shown results.
            acceptor([]);
            return;
        }

        // Options passed to the search service.
        const opts: SearchInWorkspaceOptions = {
            maxResults: this.MAX_RESULTS,
        };

        // The array in which we'll keep accumulating search results.
        const items: QuickSearchInWorkspaceResultItem[] = [];

        this.searchInWorkspaceService.search(lookFor, {

            onResult: (searchId: number, result: SearchInWorkspaceResult) => {
                // Is this result from a previous search?
                if (searchId !== this.currentSearchId) {
                    return;
                }

                items.push(new QuickSearchInWorkspaceResultItem(result, this.openerService, this.labelProvider));
            },

            onDone: (searchId: number, error?: string) => {
                if (searchId !== this.currentSearchId) {
                    this.logger.debug('Search ' + this.currentSearchId + ' has completed, but it\'s not the current search.');
                    return;
                }
                this.logger.debug('Search ' + this.currentSearchId + ' has completed and is the current search.');
                this.currentSearchId = -1;

                if (error) {
                    this.showFakeResult(error, acceptor);
                } else if (items.length !== 0) {
                    items.sort((a, b) => SearchInWorkspaceResult.compare(a.getResult(), b.getResult()));
                    acceptor(items);
                } else {
                    this.showFakeResult('No matches :(', acceptor);
                }

            },
        }, opts).then(searchId => {
            this.currentSearchId = searchId;
        });
    }

    showFakeResult(label: string, acceptor: (items: QuickOpenItem[]) => void) {
        acceptor([
            new QuickOpenItem({
                label: label,
            }),
        ]);
    }

    // If we have an ongoing search, cancel it.
    cancelCurrentSeach() {
        if (this.currentSearchId >= 0) {
            this.logger.debug('Cancelling search ' + this.currentSearchId);
            this.searchInWorkspaceService.cancel(this.currentSearchId);
            this.currentSearchId = -1;
        }
    }

    // Open the quick search in workspace popup.
    open() {
        const opts: QuickOpenOptions = {
            onClose: cancelled => this.cancelCurrentSeach(),
            placeholder: 'Search in workspace by regular expression...',
        };
        this.quickOpenService.open(this, opts);
    }
}

class QuickSearchInWorkspaceResultItem extends QuickOpenItem {

    private result: SearchInWorkspaceResult;
    private openerService: OpenerService;

    constructor(result: SearchInWorkspaceResult, openerService: OpenerService, labelProvider: LabelProvider) {
        const resultHl: Highlight = {
            start: result.character - 1,
            end: result.character + result.length - 1,
        };

        // Show the path relative to the workspace.
        const uri = new URI('file://' + result.file);
        const file = labelProvider.getName(uri);
        const dir = labelProvider.getLongName(uri.parent) + '/';

        const filenameHl: Highlight = {
            start: 0,
            end: file.length,
        };

        const opts: QuickOpenItemOptions = {
            detail: result.lineText,
            detailHighlights: [resultHl],
            label: `${file}:${result.line} - ${dir}`,
            labelHighlights: [filenameHl],
        };
        super(opts);

        this.result = result;
        this.openerService = openerService;
    }

    run(mode: QuickOpenMode): boolean {
        if (mode !== QuickOpenMode.OPEN) {
            return false;
        }

        // Search results are 1-based, positions in editors are 0-based.
        const line = this.result.line - 1;
        const character = this.result.character - 1;
        const uri = new URI('file://' + this.result.file);
        const r = Range.create(line, character, line, character + this.result.length);
        open(this.openerService, uri, { selection: r });

        return true;
    }

    getResult(): SearchInWorkspaceResult {
        return this.result;
    }
}

const OpenQuickSearchInWorkspaceCommand = {
    id: 'QuickSearchInWorkspace.open',
    label: "Search in Workspace..."
};

@injectable()
export class SearchInWorkspaceContributions implements CommandContribution, MenuContribution, KeybindingContribution {
    constructor(
        @inject(QuickSearchInWorkspace) protected readonly quickSeachInWorkspace: QuickSearchInWorkspace,
    ) { }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(OpenQuickSearchInWorkspaceCommand, {
            execute: what => this.quickSeachInWorkspace.open(),
            isEnabled: () => this.quickSeachInWorkspace.isEnabled(),
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.EDIT_FIND, {
            commandId: OpenQuickSearchInWorkspaceCommand.id,
            label: OpenQuickSearchInWorkspaceCommand.label,
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: OpenQuickSearchInWorkspaceCommand.id,
            keybinding: 'ctrlcmd+shift+f',
        });
    }
}
