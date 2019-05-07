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

// tslint:disable:no-any

import { injectable, inject, postConstruct } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { cancelled, CancellationTokenSource, CancellationToken, checkCancelled } from '@theia/core/lib/common/cancellation';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { MessageService } from '@theia/core/lib/common/message-service';
import { Progress } from '@theia/core/src/common/message-service-protocol';
import { MaybePromise } from '@theia/core/src/common/types';
import { DisposableCollection, Disposable } from '@theia/core/lib/common/disposable';
import { FilesEndpoint } from './files-endpoint';

// limit upload size to avoid out of memory in main process
const maxUploadSize = 64 * 1024 * 1024;
// timeout a request if it hangs on a flaky connection
const uploadRequestTimeout = 5 * 1000;
// retry to upload on a flaky connection
const maxAttempts = 5;
const initialRetryTimeout = 1000;

export interface FileUploadParams {
    source?: DataTransfer
    progress?: FileUploadProgressParams
}
export interface FileUploadProgressParams {
    text: string
}

export interface FileUploadResult {
    uploaded: URI[]
}

@injectable()
export class FileUploadService {

    static TARGET = 'target';
    static UPLOAD = 'upload';

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(FilesEndpoint)
    protected readonly endpoint: FilesEndpoint;

    protected uploadForm: FileUploadService.Form;

    @postConstruct()
    protected init(): void {
        this.uploadForm = this.createUploadForm();
    }

    protected createUploadForm(): FileUploadService.Form {
        const targetInput = document.createElement('input');
        targetInput.type = 'text';
        targetInput.name = FileUploadService.TARGET;

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
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
                const body = new FormData(form);
                // clean up to allow upload to the same folder twice
                fileInput.value = '';
                const target = new URI(<string>body.get(FileUploadService.TARGET));
                const uploaded = body.getAll(FileUploadService.UPLOAD).map((file: File) => target.resolve(file.name));
                const { resolve, reject } = this.deferredUpload;
                this.deferredUpload = undefined;
                this.withProgress((progress, token) => this.submitForm({
                    body, token,
                    onDidProgress: event => {
                        if (event.lengthComputable) {
                            progress.report({
                                work: {
                                    done: event.loaded,
                                    total: event.total
                                }
                            });
                        }
                    }
                }), this.uploadForm.progress).then(() => resolve({ uploaded }), reject);
            }
        });
        return { targetInput, fileInput };
    }

    protected deferredUpload: Deferred<FileUploadResult> | undefined;
    async upload(targetUri: string | URI, params: FileUploadParams = {}): Promise<FileUploadResult> {
        const { source } = params;
        if (source) {
            return this.withProgress(async (progress, token) => {
                const context: FileUploadService.Context = { entries: [], progress, token };
                await this.indexDataTransfer(new URI(String(targetUri)), source, context);
                return this.doUpload(context);
            }, params.progress);
        }
        this.deferredUpload = new Deferred<FileUploadResult>();
        this.uploadForm.targetInput.value = String(targetUri);
        this.uploadForm.fileInput.click();
        this.uploadForm.progress = params.progress;
        return this.deferredUpload.promise;
    }

    protected async doUpload({ entries, progress, token }: FileUploadService.Context): Promise<FileUploadResult> {
        const result: FileUploadResult = { uploaded: [] };
        if (!entries.length) {
            return result;
        }
        let done = 0;
        const total = entries.length;
        let chunkSize = 0;
        let chunkLength = 0;
        let body = new FormData();
        const uploadChunk = async () => {
            progress.report({ work: { done, total } });
            await this.submitForm({
                body, token,
                onDidProgress: event => {
                    if (event.lengthComputable) {
                        const chunkDone = chunkLength * event.loaded / event.total;
                        progress.report({
                            work: {
                                done: done + chunkDone,
                                total
                            }
                        });
                    }
                }
            });
            checkCancelled(token);
            for (const file of body.getAll(FileUploadService.UPLOAD)) {
                result.uploaded.push(new URI((file as File).name));
            }
            done += chunkLength;
            progress.report({ work: { done, total } });
            chunkLength = 0;
            chunkSize = 0;
            body = new FormData();
        };
        for (const entry of entries) {
            const file = await entry.file();
            checkCancelled(token);
            if (chunkLength && chunkSize + file.size > maxUploadSize) {
                await uploadChunk();
            }
            chunkLength++;
            chunkSize += file.size;
            body.append(FileUploadService.UPLOAD, file, entry.uri.toString());
        }
        if (chunkLength) {
            await uploadChunk();
        }
        progress.report({ work: { done: total, total } });
        return result;
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

    protected async indexDataTransfer(targetUri: URI, dataTransfer: DataTransfer, context: FileUploadService.Context): Promise<void> {
        checkCancelled(context.token);
        if (dataTransfer.items) {
            await this.indexDataTransferItemList(targetUri, dataTransfer.items, context);
        } else {
            this.indexFileList(targetUri, dataTransfer.files, context);
        }
    }

    protected indexFileList(targetUri: URI, files: FileList, context: FileUploadService.Context): void {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file) {
                this.indexFile(targetUri, file, context);
            }
        }
    }

    protected indexFile(targetUri: URI, file: File, context: FileUploadService.Context): void {
        context.entries.push({
            uri: targetUri.resolve(file.name),
            file: () => file
        });
    }

    protected async indexDataTransferItemList(targetUri: URI, items: DataTransferItemList, context: FileUploadService.Context): Promise<void> {
        checkCancelled(context.token);
        const promises: Promise<void>[] = [];
        for (let i = 0; i < items.length; i++) {
            const entry = items[i].webkitGetAsEntry() as WebKitEntry;
            promises.push(this.indexEntry(targetUri, entry, context));
        }
        await Promise.all(promises);
    }

    protected async indexEntry(targetUri: URI, entry: WebKitEntry | null, context: FileUploadService.Context): Promise<void> {
        checkCancelled(context.token);
        if (!entry) {
            return;
        }
        if (entry.isDirectory) {
            await this.indexDirectoryEntry(targetUri, entry as WebKitDirectoryEntry, context);
        } else {
            this.indexFileEntry(targetUri, entry as WebKitFileEntry, context);
        }
    }

    protected async indexDirectoryEntry(targetUri: URI, entry: WebKitDirectoryEntry, context: FileUploadService.Context): Promise<void> {
        checkCancelled(context.token);
        const newTargetUri = targetUri.resolve(entry.name);
        const promises: Promise<void>[] = [];
        await this.readEntries(entry, items => promises.push(this.indexEntries(newTargetUri, items, context)), context);
        await Promise.all(promises);
    }

    /**
     *  Read all entries within a folder by block of 100 files or folders until the
     *  whole folder has been read.
     */
    protected async readEntries(entry: WebKitDirectoryEntry, cb: (items: any) => void, context: FileUploadService.Context): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            const reader = entry.createReader();
            const getEntries = () => reader.readEntries(results => {
                if (!context.token.isCancellationRequested && results && results.length) {
                    cb(results);
                    getEntries(); // loop to read all entries
                } else {
                    resolve();
                }
            }, reject);
            getEntries();
        });
    }

    protected async indexEntries(targetUri: URI, entries: WebKitEntry[], context: FileUploadService.Context): Promise<void> {
        checkCancelled(context.token);
        const promises: Promise<void>[] = [];
        for (let i = 0; i < entries.length; i++) {
            promises.push(this.indexEntry(targetUri, entries[i], context));
        }
        await Promise.all(promises);
    }

    protected indexFileEntry(targetUri: URI, entry: WebKitFileEntry, context: FileUploadService.Context): void {
        context.entries.push({
            uri: targetUri.resolve(entry.name),
            file: () => new Promise((resolve, reject) => entry.file(resolve, reject))
        });
    }

    protected async submitForm(options: FileUploadService.SubmitOptions): Promise<void> {
        let attempts = 0;
        let retryTimeout = initialRetryTimeout;
        let error: FileUploadService.SubmitError | undefined;
        while (attempts < maxAttempts) {
            try {
                error = undefined;
                await this.doSubmitForm(options);
                return;
            } catch (e) {
                if (!FileUploadService.isSubmitError(e)) {
                    throw e;
                }
                error = e;
                if (e.status === 0) {
                    this.messageService.warn(`Upload Failed: ${e.message}, trying again in ${retryTimeout / 1000} sec${retryTimeout !== 1000 ? 's' : ''}`, {
                        timeout: retryTimeout
                    });
                    await new Promise(resolve => setTimeout(resolve, retryTimeout));
                    retryTimeout = retryTimeout * 2;
                    attempts++;
                } else {
                    attempts = maxAttempts;
                }
            }
        }
        if (error) {
            this.messageService.error('Upload Failed: ' + error.message, { timeout: 0 });
            throw error;
        }
    }

    protected async doSubmitForm({ body, token, onDidProgress }: FileUploadService.SubmitOptions): Promise<void> {
        const deferredUpload = new Deferred<void>();
        try {
            const request = new XMLHttpRequest();

            const toDispose = new DisposableCollection();
            deferredUpload.promise.then(() => toDispose.dispose(), () => toDispose.dispose());
            // IMPORTANT: we should release all listeners in order to release associated FormData and Files!
            const addRequestListener = <K extends keyof XMLHttpRequestEventMap>(type: K, listener: (this: XMLHttpRequest, ev: XMLHttpRequestEventMap[K]) => any) => {
                request.addEventListener(type, listener);
                toDispose.push(Disposable.create(() => request.removeEventListener<K>(type, listener)));
            };
            const addProgressListener = (listener: (event: ProgressEvent) => void) => {
                request.upload.addEventListener('progress', listener);
                toDispose.push(Disposable.create(() => request.upload.removeEventListener('progress', listener)));
            };

            const rejectRequest = (statusText: string, status = 0) => {
                const error: FileUploadService.SubmitError = Object.assign(new Error(statusText), { status });
                deferredUpload.reject(error);
            };

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
                    rejectRequest(statusText, request.status);
                }
            };
            addRequestListener('load', cb);
            addRequestListener('error', cb);
            addRequestListener('abort', () => deferredUpload.reject(cancelled()));

            toDispose.push(token.onCancellationRequested(() => request.abort()));
            addProgressListener(onDidProgress);

            const toDisposeOnResetTimeout = new DisposableCollection();
            const resetTimeout = () => {
                toDisposeOnResetTimeout.dispose();
                toDispose.push(toDisposeOnResetTimeout);
                const handle = setTimeout(() => {
                    rejectRequest('the request has timed out');
                    request.abort();
                }, uploadRequestTimeout);
                toDisposeOnResetTimeout.push(Disposable.create(() => clearTimeout(handle)));
            };
            resetTimeout();
            addProgressListener(resetTimeout);

            request.open('POST', this.endpoint.url.toString());
            request.send(body);
        } catch (e) {
            deferredUpload.reject(e);
        }
        return deferredUpload.promise;
    }

}

export namespace FileUploadService {
    export interface UploadEntry {
        file: () => MaybePromise<File>
        uri: URI
    }
    export interface Context {
        progress: Progress
        token: CancellationToken
        entries: UploadEntry[]
    }
    export interface Form {
        targetInput: HTMLInputElement
        fileInput: HTMLInputElement
        progress?: FileUploadProgressParams
    }
    export interface SubmitOptions {
        body: FormData
        token: CancellationToken
        onDidProgress: (event: ProgressEvent) => void
    }
    export interface SubmitError extends Error {
        status: number;
    }
    export function isSubmitError(e: any): e is SubmitError {
        return !!e && 'status' in e;
    }
}
