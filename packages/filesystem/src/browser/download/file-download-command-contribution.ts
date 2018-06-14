/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { notEmpty } from '@theia/core/lib/common/objects';
import { UriSelection } from '@theia/core/lib/common/selection';
import { SelectionService } from '@theia/core/lib/common/selection-service';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { UriAwareCommandHandler, UriCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import { FileDownloadService } from './file-download-service';

@injectable()
export class FileDownloadCommandContribution implements CommandContribution {

    @inject(FileDownloadService)
    protected readonly downloadService: FileDownloadService;

    @inject(SelectionService)
    protected readonly selectionService: SelectionService;

    registerCommands(registry: CommandRegistry): void {
        const handler = new UriAwareCommandHandler<URI[]>(this.selectionService, this.downloadHandler(), { multi: true });
        registry.registerCommand(FileDownloadCommands.DOWNLOAD, handler);
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

    protected getUris(uri: Object | undefined): URI[] {
        if (uri === undefined) {
            return [];
        }
        return (Array.isArray(uri) ? uri : [uri]).map(u => this.getUri(u)).filter(notEmpty);
    }

    protected getUri(uri: Object | undefined): URI | undefined {
        if (uri instanceof URI) {
            return uri;
        }
        if (UriSelection.is(uri)) {
            return uri.uri;
        }
        return undefined;
    }

}

export namespace FileDownloadCommands {

    export const DOWNLOAD: Command = {
        id: 'file.download'
    };

}
