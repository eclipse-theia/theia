/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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
import URI from '@theia/core/lib/common/uri';
import { SelectionService } from '@theia/core/lib/common/selection-service';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { UriAwareCommandHandler, UriCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import { ExpandableTreeNode } from '@theia/core/lib/browser/tree';
import { FileDownloadService } from './file-download-service';
import { FileSelection } from '../file-selection';
import { TreeWidgetSelection } from '@theia/core/lib/browser/tree/tree-widget-selection';
import { isCancelled } from '@theia/core/lib/common/cancellation';

@injectable()
export class FileDownloadCommandContribution implements CommandContribution {

    @inject(FileDownloadService)
    protected readonly downloadService: FileDownloadService;

    @inject(SelectionService)
    protected readonly selectionService: SelectionService;

    registerCommands(registry: CommandRegistry): void {
        const handler = new UriAwareCommandHandler<URI[]>(this.selectionService, this.downloadHandler(), { multi: true });
        registry.registerCommand(FileDownloadCommands.DOWNLOAD, handler);
        registry.registerCommand(FileDownloadCommands.UPLOAD, new FileSelection.CommandHandler(this.selectionService, {
            multi: false,
            isEnabled: selection => this.canUpload(selection),
            isVisible: selection => this.canUpload(selection),
            execute: selection => this.upload(selection)
        }));
    }

    protected canUpload({ fileStat }: FileSelection): boolean {
        return fileStat.isDirectory;
    }

    protected async upload(selection: FileSelection): Promise<void> {
        try {
            const source = TreeWidgetSelection.getSource(this.selectionService.selection);
            await this.downloadService.upload(selection.fileStat.uri);
            if (ExpandableTreeNode.is(selection) && source) {
                await source.model.expandNode(selection);
            }
        } catch (e) {
            if (!isCancelled(e)) {
                console.error(e);
            }
        }
    }

    protected downloadHandler(): UriCommandHandler<URI[]> {
        return {
            execute: uris => this.executeDownload(uris),
            isEnabled: uris => this.isDownloadEnabled(uris),
            isVisible: uris => this.isDownloadVisible(uris),
        };
    }

    protected async executeDownload(uris: URI[]): Promise<void> {
        this.downloadService.download(uris);
    }

    protected isDownloadEnabled(uris: URI[]): boolean {
        return uris.length > 0 && uris.every(u => u.scheme === 'file');
    }

    protected isDownloadVisible(uris: URI[]): boolean {
        return this.isDownloadEnabled(uris);
    }

}

export namespace FileDownloadCommands {

    export const DOWNLOAD: Command = {
        id: 'file.download',
        category: 'File',
        label: 'Download'
    };

    export const UPLOAD: Command = {
        id: 'file.upload',
        category: 'File',
        label: 'Upload Files...'
    };

}
