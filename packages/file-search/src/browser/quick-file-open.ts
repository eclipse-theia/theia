/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify";
import { QuickOpenModel, QuickOpenItem, QuickOpenMode, QuickOpenService, OpenerService } from '@theia/core/lib/browser';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common/filesystem';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import URI from '@theia/core/lib/common/uri';
import { FileSearchService } from '../common/file-search-service';
import { CancellationTokenSource } from '@theia/core/lib/common';
import { LabelProvider } from "@theia/core/lib/browser/label-provider";

@injectable()
export class QuickFileOpenService implements QuickOpenModel {

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(QuickOpenService) protected readonly quickOpenService: QuickOpenService,
        @inject(FileSearchService) protected readonly fileSearchService: FileSearchService,
        @inject(LabelProvider) protected readonly labelProvider: LabelProvider
    ) {
        workspaceService.root.then(root => this.wsRoot = root);
    }

    private wsRoot: FileStat | undefined;

    isEnabled(): boolean {
        return this.wsRoot !== undefined;
    }

    open(): void {
        this.quickOpenService.open(this, {
            placeholder: 'file name to search',
            fuzzyMatchLabel: true,
            fuzzyMatchDescription: true,
            fuzzySort: true
        });
    }

    private cancelIndicator = new CancellationTokenSource();

    public async onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): Promise<void> {
        if (!this.wsRoot) {
            return;
        }
        this.cancelIndicator.cancel();
        this.cancelIndicator = new CancellationTokenSource();
        const token = this.cancelIndicator.token;
        const proposed = new Set<string>();
        const rootUri = this.wsRoot.uri;
        const handler = async (result: string[]) => {
            if (!token.isCancellationRequested) {
                const root = new URI(rootUri);
                result.forEach(p => {
                    const uri = root.withPath(root.path.join(p)).toString();
                    proposed.add(uri);
                });
                const itemPromises = Array.from(proposed).map(uri => this.toItem(uri));
                acceptor(await Promise.all(itemPromises));
            }
        };
        this.fileSearchService.find(lookFor, { rootUri, fuzzyMatch: true, limit: 200 }, token).then(handler);
    }

    private async toItem(uriString: string) {
        const uri = new URI(uriString);
        return new FileQuickOpenItem(uri,
            this.labelProvider.getName(uri),
            await this.labelProvider.getIcon(uri),
            this.labelProvider.getLongName(uri.parent),
            this.openerService);
    }

}

export class FileQuickOpenItem extends QuickOpenItem {

    constructor(
        protected readonly uri: URI,
        protected readonly label: string,
        protected readonly icon: string,
        protected readonly parent: string,
        protected readonly openerService: OpenerService
    ) {
        super();
    }

    getLabel(): string {
        return this.label;
    }

    isHidden(): boolean {
        return false;
    }

    getTooltip(): string {
        return this.uri.path.toString();
    }

    getDescription(): string {
        return this.parent;
    }

    getUri(): URI {
        return this.uri;
    }

    getIconClass(): string {
        return this.icon + ' file-icon';
    }

    run(mode: QuickOpenMode): boolean {
        if (mode !== QuickOpenMode.OPEN) {
            return false;
        }
        this.openerService.getOpener(this.uri).then(opener => opener.open(this.uri));
        return true;
    }
}
