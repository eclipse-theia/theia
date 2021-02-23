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

import { inject, injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { ILogger } from '@theia/core/lib/common/logger';
import { Endpoint } from '@theia/core/lib/browser/endpoint';
import { FileDownloadData } from '../../common/download/file-download-data';
import { MessageService } from '@theia/core/lib/common/message-service';
import { addClipboardListener } from '@theia/core/lib/browser/widgets';

@injectable()
export class FileDownloadService {

    protected anchor: HTMLAnchorElement | undefined;
    protected downloadCounter: number = 0;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    protected handleCopy(event: ClipboardEvent, downloadUrl: string): void {
        if (downloadUrl && event.clipboardData) {
            event.clipboardData.setData('text/plain', downloadUrl);
            event.preventDefault();
            this.messageService.info('Copied the download link to the clipboard.');
        }
    }

    async cancelDownload(id: string): Promise<void> {
        await fetch(`${this.endpoint()}/download/?id=${id}&cancel=true`);
    }

    async download(uris: URI[], options?: FileDownloadService.DownloadOptions): Promise<void> {
        let cancel = false;
        if (uris.length === 0) {
            return;
        }
        const copyLink = options && options.copyLink ? true : false;
        try {
            const [progress, result] = await Promise.all([
                this.messageService.showProgress({
                    text: `Preparing download${copyLink ? ' link' : ''}...`, options: { cancelable: true }
                }, () => { cancel = true; }),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                new Promise<{ response: Response, jsonResponse: any }>(async resolve => {
                    const resp = await fetch(this.request(uris));
                    const jsonResp = await resp.json();
                    resolve({ response: resp, jsonResponse: jsonResp });
                })
            ]);
            const { response, jsonResponse } = result;
            if (cancel) {
                this.cancelDownload(jsonResponse.id);
                return;
            }
            const { status, statusText } = response;
            if (status === 200) {
                progress.cancel();
                const downloadUrl = `${this.endpoint()}/download/?id=${jsonResponse.id}`;
                if (copyLink) {
                    if (document.documentElement) {
                        const toDispose = addClipboardListener(document.documentElement, 'copy', e => {
                            toDispose.dispose();
                            this.handleCopy(e, downloadUrl);
                        });
                        document.execCommand('copy');
                    }
                } else {
                    this.forceDownload(jsonResponse.id, decodeURIComponent(jsonResponse.name));
                }
            } else {
                throw new Error(`Received unexpected status code: ${status}. [${statusText}]`);
            }
        } catch (e) {
            this.logger.error(`Error occurred when downloading: ${uris.map(u => u.toString(true))}.`, e);
        }
    }

    protected async forceDownload(id: string, title: string): Promise<void> {
        let url: string | undefined;
        try {
            if (this.anchor === undefined) {
                this.anchor = document.createElement('a');
            }
            const endpoint = this.endpoint();
            url = `${endpoint}/download/?id=${id}`;
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

export namespace FileDownloadService {
    export interface DownloadOptions {
        /**
         * `true` if the download link has to be copied to the clipboard. This will not trigger the actual download. Defaults to `false`.
         */
        readonly copyLink?: boolean;
    }
}
