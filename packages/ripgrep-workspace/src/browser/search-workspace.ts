/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify";
import { QuickOpenModel, QuickOpenItem, QuickOpenMode, OpenerService, QuickOpenService } from '@theia/core/lib/browser';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common/filesystem';
import { FileIconProvider } from '@theia/filesystem/lib/browser/icons/file-icons';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import URI from '@theia/core/lib/common/uri';
import { CancellationTokenSource } from '@theia/core/lib/common';
import { ISearchWorkSpaceServer } from '../common/search-workspace-service';

@injectable()
export class SearchWorkSpaceService implements QuickOpenModel {

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(FileIconProvider) protected readonly fileIconProvider: FileIconProvider,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(QuickOpenService) protected readonly quickOpenService: QuickOpenService,
        @inject(ISearchWorkSpaceServer) protected readonly searchWorkSpaceService: ISearchWorkSpaceServer
    ) {
        workspaceService.root.then(root => this.wsRoot = root);
    }

    private wsRoot: FileStat;

    isEnabled(): boolean {
        return this.wsRoot !== undefined;
    }

    open(): void {
        console.log("triggered search workspace, congrats!!");
        this.quickOpenService.open(this, {
            placeholder: 'string to search',
            fuzzyMatchLabel: true,
            fuzzyMatchDescription: true,
            fuzzySort: true
        });

    }

    public getItems(lookFor: string): QuickOpenItem[] {
        let items: QuickOpenItem[] = [];
        console.log("getItems ... " + lookFor);

        this.searchWorkSpaceService.search("Welcome", new URI('/home/lmcgupe/Desktop/Theia/theia').toString());

        this.searchWorkSpaceService.on('search-entry-found', data => {
            console.log("search-workspace-spec entry-found - PARSE data is :" + data.file);
            console.log("search-workspace-spec entry-found - PARSE data is :" + data.match);
        });

        this.searchWorkSpaceService.on('search-finished', () => {
            console.log("PARSE rsearch-finished: ");
        });

        return items;
    }
    private cancelIndicator = new CancellationTokenSource();

    public async onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): Promise<void> {
        this.cancelIndicator.cancel();
        this.cancelIndicator = new CancellationTokenSource();
        console.log("onType ... ");

    }

}

export class FileQuickOpenItem extends QuickOpenItem {

    private activeElement: HTMLElement;

    constructor(
        protected readonly uri: URI,
        protected readonly icon: string,
        protected readonly parent: string,
        protected readonly openerService: OpenerService
    ) {
        super();
        this.activeElement = window.document.activeElement as HTMLElement;
    }

    getLabel(): string {
        return this.uri.displayName;
    }

    isHidden(): boolean {
        return false;
    }

    getTooltip(): string | undefined {
        return this.uri.path.toString();
    }

    getDescription(): string | undefined {
        return this.parent;
    }

    getUri(): URI | undefined {
        return this.uri;
    }

    getIconClass(): string | undefined {
        return this.icon;
    }

    run(mode: QuickOpenMode): boolean {
        if (mode !== QuickOpenMode.OPEN) {
            return false;
        }
        this.openerService.getOpener(this.uri).then(opener => opener.open(this.uri));
        return true;
    }
}
