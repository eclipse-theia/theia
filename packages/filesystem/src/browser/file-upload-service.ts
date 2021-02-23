/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { CancellationTokenSource, CancellationToken, checkCancelled, cancelled } from '@theia/core/lib/common/cancellation';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { MessageService } from '@theia/core/lib/common/message-service';
import { Progress } from '@theia/core/lib/common/message-service-protocol';
import { Endpoint } from '@theia/core/lib/browser/endpoint';

import throttle = require('@theia/core/shared/lodash.throttle');

const maxChunkSize = 64 * 1024;

export interface FileUploadParams {
    source?: DataTransfer
    progress?: FileUploadProgressParams
    onDidUpload?: (uri: string) => void;
}
export interface FileUploadProgressParams {
    text: string
}

export interface FileUploadResult {
    uploaded: string[]
}

@injectable()
export class FileUploadService {

    static TARGET = 'target';
    static UPLOAD = 'upload';

    @inject(MessageService)
    protected readonly messageService: MessageService;

    protected uploadForm: FileUploadService.Form;

    @postConstruct()
    protected init(): void {
        this.uploadForm = this.createUploadForm();
    }

    protected createUploadForm(): FileUploadService.Form {
        const targetInput = document.createElement('input');
        targetInput.type = 'text';
        targetInput.name = FileUploadService.TARGET;
        targetInput.classList.add('theia-input');

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.classList.add('theia-input');
        fileInput.name = FileUploadService.UPLOAD;
        fileInput.multiple = true;

        const form = document.createElement('form');
        form.style.display = 'none';
        form.enctype = 'multipart/form-data';
        form.append(targetInput);
        form.append(fileInput);

        document.body.appendChild(form);

        fileInput.addEventListener('change', () => {
            if (this.deferredUpload && fileInput.value) {
                const source = new FormData(form);
                // clean up to allow upload to the same folder twice
                fileInput.value = '';
                const targetUri = new URI(<string>source.get(FileUploadService.TARGET));
                const { resolve, reject } = this.deferredUpload;
                this.deferredUpload = undefined;
                const { onDidUpload } = this.uploadForm;
                this.withProgress(
                    (progress, token) => this.doUpload(targetUri, { source, progress, token, onDidUpload }),
                    this.uploadForm.progress).then(resolve, reject);
            }
        });
        return { targetInput, fileInput };
    }

    protected deferredUpload: Deferred<FileUploadResult> | undefined;
    async upload(targetUri: string | URI, params: FileUploadParams = {}): Promise<FileUploadResult> {
        const { source, onDidUpload } = params;
        if (source) {
            return this.withProgress(
                (progress, token) => this.doUpload(new URI(String(targetUri)), { source, progress, token, onDidUpload }),
                params.progress);
        }
        this.deferredUpload = new Deferred<FileUploadResult>();
        this.uploadForm.targetInput.value = String(targetUri);
        this.uploadForm.fileInput.click();
        this.uploadForm.progress = params.progress;
        this.uploadForm.onDidUpload = params.onDidUpload;
        return this.deferredUpload.promise;
    }

    protected async doUpload(targetUri: URI, { source, progress, token, onDidUpload }: FileUploadService.UploadParams): Promise<FileUploadResult> {
        const result: FileUploadResult = { uploaded: [] };
        let total = 0;
        let done = 0;
        let totalFiles = 0;
        let doneFiles = 0;
        const reportProgress = throttle(() => progress.report({
            message: `${doneFiles} out of ${totalFiles}`,
            work: { done, total }
        }), 60);
        const deferredUpload = new Deferred<FileUploadResult>();
        const endpoint = new Endpoint({ path: '/file-upload' });
        const socketOpen = new Deferred<void>();
        const socket = new WebSocket(endpoint.getWebSocketUrl().toString());
        socket.onerror = e => {
            socketOpen.reject(e);
            deferredUpload.reject(e);
        };
        socket.onclose = ({ code, reason }) => deferredUpload.reject(new Error(String(reason || code)));
        socket.onmessage = ({ data }) => {
            const response = JSON.parse(data);
            if (response.uri) {
                doneFiles++;
                result.uploaded.push(response.uri);
                reportProgress();
                if (onDidUpload) {
                    onDidUpload(response.uri);
                }
                return;
            }
            if (response.done) {
                done = response.done;
                reportProgress();
                return;
            }
            if (response.ok) {
                deferredUpload.resolve(result);
            } else if (response.error) {
                deferredUpload.reject(new Error(response.error));
            } else {
                console.error('unknown upload response: ' + response);
            }
            socket.close();
        };
        socket.onopen = () => socketOpen.resolve();
        const rejectAndClose = (e: Error) => {
            deferredUpload.reject(e);
            if (socket.readyState === 1) {
                socket.close();
            }
        };
        token.onCancellationRequested(() => rejectAndClose(cancelled()));
        try {
            let queue = Promise.resolve();
            await this.index(targetUri, source, {
                token,
                progress,
                accept: async ({ uri, file }) => {
                    total += file.size;
                    totalFiles++;
                    reportProgress();
                    queue = queue.then(async () => {
                        try {
                            await socketOpen.promise;
                            checkCancelled(token);
                            let readBytes = 0;
                            socket.send(JSON.stringify({ uri: uri.toString(), size: file.size }));
                            if (file.size) {
                                do {
                                    const fileSlice = await this.readFileSlice(file, readBytes);
                                    checkCancelled(token);
                                    readBytes = fileSlice.read;
                                    socket.send(fileSlice.content);
                                    while (socket.bufferedAmount > maxChunkSize * 2) {
                                        await new Promise(resolve => setImmediate(resolve));
                                        checkCancelled(token);
                                    }
                                } while (readBytes < file.size);
                            }
                        } catch (e) {
                            rejectAndClose(e);
                        }
                    });
                }
            });
            await queue;
            await socketOpen.promise;
            socket.send(JSON.stringify({ ok: true }));
        } catch (e) {
            rejectAndClose(e);
        }
        return deferredUpload.promise;
    }

    protected readFileSlice(file: File, read: number): Promise<{
        content: ArrayBuffer
        read: number
    }> {
        return new Promise((resolve, reject) => {
            const bytesLeft = file.size - read;
            if (!bytesLeft) {
                reject(new Error('nothing to read'));
                return;
            }
            const size = Math.min(maxChunkSize, bytesLeft);
            const slice = file.slice(read, read + size);
            const reader = new FileReader();
            reader.onload = () => {
                read += size;
                const content = reader.result as ArrayBuffer;
                resolve({ content, read });
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(slice);
        });
    }

    protected async withProgress<T>(
        cb: (progress: Progress, token: CancellationToken) => Promise<T>,
        { text }: FileUploadProgressParams = { text: 'Uploading Files...' }
    ): Promise<T> {
        const cancellationSource = new CancellationTokenSource();
        const { token } = cancellationSource;
        const progress = await this.messageService.showProgress({ text, options: { cancelable: true } }, () => cancellationSource.cancel());
        try {
            return await cb(progress, token);
        } finally {
            progress.cancel();
        }
    }

    protected async index(targetUri: URI, source: FileUploadService.Source, context: FileUploadService.Context): Promise<void> {
        if (source instanceof FormData) {
            await this.indexFormData(targetUri, source, context);
        } else {
            await this.indexDataTransfer(targetUri, source, context);
        }
    }

    protected async indexFormData(targetUri: URI, formData: FormData, context: FileUploadService.Context): Promise<void> {
        for (const file of formData.getAll(FileUploadService.UPLOAD)) {
            if (file instanceof File) {
                await this.indexFile(targetUri, file, context);
            }
        }
    }

    protected async indexDataTransfer(targetUri: URI, dataTransfer: DataTransfer, context: FileUploadService.Context): Promise<void> {
        checkCancelled(context.token);
        if (dataTransfer.items) {
            await this.indexDataTransferItemList(targetUri, dataTransfer.items, context);
        } else {
            await this.indexFileList(targetUri, dataTransfer.files, context);
        }
    }

    protected async indexFileList(targetUri: URI, files: FileList, context: FileUploadService.Context): Promise<void> {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file) {
                await this.indexFile(targetUri, file, context);
            }
        }
    }

    protected async indexFile(targetUri: URI, file: File, context: FileUploadService.Context): Promise<void> {
        await context.accept({
            uri: targetUri.resolve(file.name),
            file
        });
    }

    protected async indexDataTransferItemList(targetUri: URI, items: DataTransferItemList, context: FileUploadService.Context): Promise<void> {
        checkCancelled(context.token);
        const entries: WebKitEntry[] = [];
        for (let i = 0; i < items.length; i++) {
            const entry = items[i].webkitGetAsEntry() as WebKitEntry;
            entries.push(entry);
        }
        await this.indexEntries(targetUri, entries, context);

    }

    protected async indexEntry(targetUri: URI, entry: WebKitEntry | null, context: FileUploadService.Context): Promise<void> {
        checkCancelled(context.token);
        if (!entry) {
            return;
        }
        if (entry.isDirectory) {
            await this.indexDirectoryEntry(targetUri, entry as WebKitDirectoryEntry, context);
        } else {
            await this.indexFileEntry(targetUri, entry as WebKitFileEntry, context);
        }
    }

    /**
     *  Read all entries within a folder by block of 100 files or folders until the
     *  whole folder has been read.
     */
    protected async indexDirectoryEntry(targetUri: URI, entry: WebKitDirectoryEntry, context: FileUploadService.Context): Promise<void> {
        checkCancelled(context.token);
        const newTargetUri = targetUri.resolve(entry.name);
        return new Promise<void>(async (resolve, reject) => {
            const reader = entry.createReader();
            const getEntries = () => reader.readEntries(async results => {
                try {
                    if (!context.token.isCancellationRequested && results && results.length) {
                        await this.indexEntries(newTargetUri, results, context);
                        getEntries(); // loop to read all getEntries
                    } else {
                        resolve();
                    }
                } catch (e) {
                    reject(e);
                }
            }, reject);
            getEntries();
        });
    }

    protected async indexEntries(targetUri: URI, entries: WebKitEntry[], context: FileUploadService.Context): Promise<void> {
        checkCancelled(context.token);
        for (let i = 0; i < entries.length; i++) {
            await this.indexEntry(targetUri, entries[i], context);
        }
    }

    protected async indexFileEntry(targetUri: URI, entry: WebKitFileEntry, context: FileUploadService.Context): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            try {
                entry.file(
                    file => this.indexFile(targetUri, file, context).then(resolve, reject),
                    reject,
                );
            } catch (e) {
                reject(e);
            }
        });
    }

}

export namespace FileUploadService {
    export type Source = FormData | DataTransfer;
    export interface UploadEntry {
        file: File
        uri: URI
    }
    export interface Context {
        progress: Progress
        token: CancellationToken
        accept: (entry: UploadEntry) => Promise<void>
    }
    export interface Form {
        targetInput: HTMLInputElement
        fileInput: HTMLInputElement
        progress?: FileUploadProgressParams
        onDidUpload?: (uri: string) => void
    }
    export interface UploadParams {
        source: FileUploadService.Source,
        progress: Progress,
        token: CancellationToken,
        onDidUpload?: (uri: string) => void
    }
}
