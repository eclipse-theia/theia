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

import { inject, injectable, postConstruct } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { cancelled } from '@theia/core/lib/common/cancellation';
import { ILogger } from '@theia/core/lib/common/logger';
import { Endpoint } from '@theia/core/lib/browser/endpoint';
import { FileSystem } from '../../common/filesystem';
import { FileDownloadData } from '../../common/download/file-download-data';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { MessageService } from '@theia/core/lib/common/message-service';
import { addClipboardListener } from '@theia/core/lib/browser/widgets';

@injectable()
export class FileDownloadService {

    protected anchor: HTMLAnchorElement | undefined;
    protected downloadCounter: number = 0;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;


    @inject(MessageService)
    protected readonly messageService: MessageService;

    protected uploadForm: {
        target: HTMLInputElement
        file: HTMLInputElement
    };

    @postConstruct()
    protected init(): void {
        this.uploadForm = this.createUploadForm();
    }

    protected createUploadForm(): {
        target: HTMLInputElement
        file: HTMLInputElement
    } {
        const target = document.createElement('input');
        target.type = 'text';
        target.name = 'target';

        const file = document.createElement('input');
        file.type = 'file';
        file.name = 'upload';
        file.multiple = true;

        const form = document.createElement('form');
        form.style.display = 'none';
        form.enctype = 'multipart/form-data';
        form.append(target);
        form.append(file);

        document.body.appendChild(form);

        file.addEventListener('change', async () => {
            if (file.value) {
                const body = new FormData(form);
                // clean up to allow upload to the same folder twice
                file.value = '';
                const filesUrl = this.filesUrl();
                const deferredUpload = this.deferredUpload;
                try {
                    const request = new XMLHttpRequest();

                    const cb = () => {
                        if (request.status === 200) {
                            deferredUpload.resolve();
                        } else {
                            let statusText = request.statusText;
                            if (!statusText) {
                                if (request.status === 413) {
                                    statusText = 'Payload Too Large';
                                } else if (request.status) {
                                    statusText = String(request.status);
                                } else {
                                    statusText = 'Network Failure';
                                }
                            }
                            const message = 'Upload Failed: ' + statusText;
                            deferredUpload.reject(new Error(message));
                            this.messageService.error(message);
                        }
                    };
                    request.addEventListener('load', cb);
                    request.addEventListener('error', cb);
                    request.addEventListener('abort', () => deferredUpload.reject(cancelled()));

                    const progress = await this.messageService.showProgress({
                        text: 'Uploading Files...', options: { cancelable: true }
                    }, () => {
                        request.upload.removeEventListener('progress', progressListener);
                        request.abort();
                    });
                    deferredUpload.promise.then(() => progress.cancel(), () => progress.cancel());
                    const progressListener = (event: ProgressEvent) => {
                        if (event.lengthComputable) {
                            progress.report({
                                work: {
                                    done: event.loaded,
                                    total: event.total
                                }
                            });
                        }
                    };
                    request.upload.addEventListener('progress', progressListener);

                    request.open('POST', filesUrl);
                    request.send(body);
                } catch (e) {
                    deferredUpload.reject(e);
                }
            }
        });
        return { target, file };
    }

    protected deferredUpload = new Deferred<void>();
    upload(targetUri: string | URI): Promise<void> {
        this.deferredUpload = new Deferred<void>();
        this.uploadForm.target.value = String(targetUri);
        this.uploadForm.file.click();
        return this.deferredUpload.promise;
    }

    protected handleCopy(event: ClipboardEvent, downloadUrl: string) {
        if (downloadUrl) {
            event.clipboardData.setData('text/plain', downloadUrl);
            event.preventDefault();
            this.messageService.info('Download link copied!');
        }
    }

    async cancelDownload(id: string) {
        await fetch(`${this.endpoint()}/download/?id=${id}&cancel=true`);
    }

    async download(uris: URI[]): Promise<void> {
        let cancel = false;
        if (uris.length === 0) {
            return;
        }
        try {
            const [progress, response] = await Promise.all([
                this.messageService.showProgress({
                    text: 'Preparing download link...', options: { cancelable: true }
                }, () => { cancel = true; }),
                fetch(this.request(uris))
            ]);
            const jsonResponse = await response.json();
            if (cancel) {
                this.cancelDownload(jsonResponse.id);
                return;
            }
            const { status, statusText } = response;
            if (status === 200) {
                progress.cancel();
                const downloadUrl = `${this.endpoint()}/download/?id=${jsonResponse.id}`;
                this.messageService.info(downloadUrl, 'Download', 'Copy Download Link').then(action => {
                    if (action === 'Download') {
                        this.forceDownload(jsonResponse.id, decodeURIComponent(jsonResponse.name));
                        this.messageService.info('Download started!');
                    } else if (action === 'Copy Download Link') {
                        if (document.documentElement) {
                            addClipboardListener(document.documentElement, 'copy', e => this.handleCopy(e, downloadUrl));
                            document.execCommand('copy');
                        }
                    } else {
                        this.cancelDownload(jsonResponse.id);
                    }
                });
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
