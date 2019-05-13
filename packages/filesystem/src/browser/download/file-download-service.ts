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
import { ILogger } from '@theia/core/lib/common/logger';
import { Endpoint } from '@theia/core/lib/browser/endpoint';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar';
import { FileSystem } from '../../common/filesystem';
import { FileDownloadData } from '../../common/download/file-download-data';
import { MessageService } from '@theia/core/lib/common/message-service';

@injectable()
export class FileDownloadService {

    protected static PREPARING_DOWNLOAD_ID = 'theia-preparing-download';

    protected anchor: HTMLAnchorElement | undefined;
    protected downloadQueue: number[] = [];
    protected downloadCounter: number = 0;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    async download(uris: URI[]): Promise<void> {
        if (uris.length === 0) {
            return;
        }
        let downloadId: number | undefined;
        try {
            downloadId = this.downloadCounter++;
            if (this.downloadQueue.length === 0) {
                await this.statusBar.setElement(FileDownloadService.PREPARING_DOWNLOAD_ID, {
                    alignment: StatusBarAlignment.RIGHT,
                    text: '$(spinner~spin) Preparing download...',
                    tooltip: 'Preparing download...',
                    priority: 1
                });
            }
            this.downloadQueue.push(downloadId);
            const response = await fetch(this.request(uris));
            await this.statusBar.removeElement(FileDownloadService.PREPARING_DOWNLOAD_ID);
            const title = await this.title(response, uris);
            const { status, statusText } = response;
            if (status === 200) {
                await this.forceDownload(response, decodeURIComponent(title));
            } else {
                throw new Error(`Received unexpected status code: ${status}. [${statusText}]`);
            }
        } catch (e) {
            this.logger.error(`Error occurred when downloading: ${uris.map(u => u.toString(true))}.`, e);
        } finally {
            if (downloadId !== undefined) {
                const indexOf = this.downloadQueue.indexOf(downloadId);
                if (indexOf !== -1) {
                    this.downloadQueue.splice(indexOf, 1);
                }
                if (this.downloadQueue.length === 0) {
                    this.statusBar.removeElement(FileDownloadService.PREPARING_DOWNLOAD_ID);
                }
            }
        }
    }

    protected async forceDownload(response: Response, title: string): Promise<void> {
        let url: string | undefined;
        try {
            const blob = await response.blob();
            url = URL.createObjectURL(blob);
            if (this.anchor === undefined) {
                this.anchor = document.createElement('a');
            }
            this.anchor.href = url;
            this.anchor.style.display = 'none';
            this.anchor.download = title;
            document.body.appendChild(this.anchor);
            this.anchor.click();
        } finally {
            // make sure anchor is removed from parent
            if (this.anchor && this.anchor.parentNode) {
                this.anchor.parentNode.removeChild(this.anchor);
            }
            if (url) {
                URL.revokeObjectURL(url);
            }
        }
    }

    protected async title(response: Response, uris: URI[]): Promise<string> {
        let title = (response.headers.get('Content-Disposition') || '').split('attachment; filename=').pop();
        if (title) {
            return title;
        }
        // tslint:disable-next-line:whitespace
        const [uri,] = uris;
        if (uris.length === 1) {
            const stat = await this.fileSystem.getFileStat(uri.toString());
            if (stat === undefined) {
                throw new Error(`Unexpected error occurred when downloading file. Files does not exist. URI: ${uri.toString(true)}.`);
            }
            title = uri.path.base;
            return stat.isDirectory ? `${title}.tar` : title;
        }
        return `${uri.parent.path.name}.tar`;
    }

    protected request(uris: URI[]): Request {
        const url = this.url(uris);
        const init = this.requestInit(uris);
        return new Request(url, init);
    }

    protected requestInit(uris: URI[]): RequestInit {
        if (uris.length === 1) {
            return {
                body: undefined,
                method: 'GET'
            };
        }
        return {
            method: 'PUT',
            body: JSON.stringify(this.body(uris)),
            headers: new Headers({ 'Content-Type': 'application/json' }),
        };
    }

    protected body(uris: URI[]): FileDownloadData {
        return {
            uris: uris.map(u => u.toString(true))
        };
    }

    protected url(uris: URI[]): string {
        const endpoint = this.endpoint();
        if (uris.length === 1) {
            // tslint:disable-next-line:whitespace
            const [uri,] = uris;
            return `${endpoint}/?uri=${uri.toString()}`;
        }
        return endpoint;

    }

    protected endpoint(): string {
        const url = this.filesUrl();
        return url.endsWith('/') ? url.slice(0, -1) : url;
    }

    protected filesUrl(): string {
        return new Endpoint({ path: 'files' }).getRestUrl().toString();
    }

}
