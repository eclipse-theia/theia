// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { CancellationTokenSource, CancellationToken, checkCancelled, cancelled, isCancelled } from '@theia/core/lib/common/cancellation';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { MessageService } from '@theia/core/lib/common/message-service';
import { Progress } from '@theia/core/lib/common/message-service-protocol';
import { Endpoint } from '@theia/core/lib/browser/endpoint';
import throttle = require('@theia/core/shared/lodash.throttle');
import { HTTP_FILE_UPLOAD_PATH } from '../common/file-upload';
import { Semaphore } from 'async-mutex';
import { FileSystemPreferences } from './filesystem-preferences';
import { FileService } from './file-service';
import { ConfirmDialog, Dialog } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { Emitter, Event } from '@theia/core/lib/common/event';

export const HTTP_UPLOAD_URL: string = new Endpoint({ path: HTTP_FILE_UPLOAD_PATH }).getRestUrl().toString(true);

export type CustomDataTransfer = Iterable<readonly [string, CustomDataTransferItem]>;

export interface CustomDataTransferItem {
    asFile(): {
        readonly id: string;
        readonly name: string;
        data(): Promise<Uint8Array>;
    } | undefined
}
export interface FileUploadParams {
    source?: DataTransfer | CustomDataTransfer
    progress?: FileUploadProgressParams
    onDidUpload?: (uri: string) => void;
    leaveInTemp?: boolean // dont move file out of the initial tmp directory
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

    protected readonly onDidUploadEmitter = new Emitter<string[]>();

    get onDidUpload(): Event<string[]> {
        return this.onDidUploadEmitter.event;
    }

    protected uploadForm: FileUploadService.Form;
    protected deferredUpload?: Deferred<FileUploadResult>;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(FileSystemPreferences)
    protected fileSystemPreferences: FileSystemPreferences;

    @inject(FileService)
    protected fileService: FileService;

    get maxConcurrentUploads(): number {
        const maxConcurrentUploads = this.fileSystemPreferences['files.maxConcurrentUploads'];
        return maxConcurrentUploads > 0 ? maxConcurrentUploads : Infinity;
    }

    @postConstruct()
    protected init(): void {
        this.uploadForm = this.createUploadForm();
    }

    protected createUploadForm(): FileUploadService.Form {
        const targetInput = document.createElement('input');
        targetInput.type = 'text';
        targetInput.spellcheck = false;
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
                const source: FileUploadService.Source = new FormData(form);
                // clean up to allow upload to the same folder twice
                fileInput.value = '';
                const targetUri = new URI(<string>source.get(FileUploadService.TARGET));
                const { resolve, reject } = this.deferredUpload;
                this.deferredUpload = undefined;
                const { onDidUpload } = this.uploadForm;
                this.withProgress(
                    (progress, token) => this.uploadAll(targetUri, { source, progress, token, onDidUpload }),
                    this.uploadForm.progress
                ).then(resolve, reject);
            }
        });
        return { targetInput, fileInput };
    }

    async upload(targetUri: string | URI, params: FileUploadParams = {}): Promise<FileUploadResult> {
        const { source, onDidUpload, leaveInTemp } = params;
        if (source) {
            return this.withProgress(
                (progress, token) => this.uploadAll(
                    typeof targetUri === 'string' ? new URI(targetUri) : targetUri,
                    { source, progress, token, leaveInTemp, onDidUpload }
                ),
                params.progress,
            );
        }
        this.deferredUpload = new Deferred<FileUploadResult>();
        this.uploadForm.targetInput.value = String(targetUri);
        this.uploadForm.fileInput.click();
        this.uploadForm.progress = params.progress;
        this.uploadForm.onDidUpload = params.onDidUpload;
        return this.deferredUpload.promise;
    }

    protected getUploadUrl(): string {
        return HTTP_UPLOAD_URL;
    }

    protected async uploadAll(targetUri: URI, params: FileUploadService.UploadParams): Promise<FileUploadResult> {
        const responses: Promise<void>[] = [];
        const status = new Map<File, {
            total: number
            done: number
            uploaded?: boolean
        }>();
        const result: FileUploadResult = {
            uploaded: []
        };
        /**
         * When `false`: display the uploading progress.
         * When `true`: display the server-processing progress.
         */
        let waitingForResponses = false;
        const report = throttle(() => {
            if (waitingForResponses) {
                /** Number of files being processed. */
                const total = status.size;
                /** Number of files uploaded and processed. */
                let done = 0;
                for (const item of status.values()) {
                    if (item.uploaded) {
                        done += 1;
                    }
                }
                params.progress.report({
                    message: nls.localize('theia/filesystem/processedOutOf', 'Processed {0} out of {1}', done, total),
                    work: { total, done }
                });
            } else {
                /** Total number of bytes being uploaded. */
                let total = 0;
                /** Current number of bytes uploaded. */
                let done = 0;
                for (const item of status.values()) {
                    total += item.total;
                    done += item.done;
                }
                params.progress.report({
                    message: nls.localize('theia/filesystem/uploadedOutOf', 'Uploaded {0} out of {1}', result.uploaded.length, status.size),
                    work: { total, done }
                });
            }
        }, 100);
        const uploads: Promise<void>[] = [];
        const uploadSemaphore = new Semaphore(this.maxConcurrentUploads);
        try {
            await this.index(targetUri, params.source, {
                token: params.token,
                progress: params.progress,
                accept: async item => {
                    if (await this.fileService.exists(item.uri) && !await this.confirmOverwrite(item.uri)) {
                        return;
                    }
                    // Track and initialize the file in the status map:
                    status.set(item.file, { total: item.file.size, done: 0 });
                    report();
                    // Don't await here: the semaphore will organize the uploading tasks, not the async indexer.
                    uploads.push(uploadSemaphore.runExclusive(async () => {
                        checkCancelled(params.token);
                        const { upload, response } = this.uploadFile(item.file, item.uri, params.token, params.leaveInTemp, (total, done) => {
                            const entry = status.get(item.file);
                            if (entry) {
                                entry.total = total;
                                entry.done = done;
                                report();
                            }
                        });
                        function onError(error: Error): void {
                            status.delete(item.file);
                            throw error;
                        }
                        responses.push(response
                            .then(() => {
                                checkCancelled(params.token);
                                // Consider the file uploaded once the server sends OK back.
                                result.uploaded.push(item.uri.toString(true));
                                const entry = status.get(item.file);
                                if (entry) {
                                    entry.uploaded = true;
                                    report();
                                }
                            })
                            .catch(onError)
                        );
                        // Have the queue wait for the upload only.
                        return upload
                            .catch(onError);
                    }));
                }
            });
            checkCancelled(params.token);
            await Promise.all(uploads);
            checkCancelled(params.token);
            waitingForResponses = true;
            report();
            await Promise.all(responses);
        } catch (error) {
            uploadSemaphore.cancel();
            if (!isCancelled(error)) {
                this.messageService.error(nls.localize('theia/filesystem/uploadFailed', 'An error occurred while uploading a file. {0}', error.message));
                throw error;
            }
        }
        this.onDidUploadEmitter.fire(result.uploaded);
        return result;
    }

    protected async confirmOverwrite(fileUri: URI): Promise<boolean> {
        const dialog = new ConfirmDialog({
            title: nls.localizeByDefault('Replace'),
            msg: nls.localizeByDefault("A file or folder with the name '{0}' already exists in the destination folder. Do you want to replace it?", fileUri.path.base),
            ok: nls.localizeByDefault('Replace'),
            cancel: Dialog.CANCEL
        });
        return !!await dialog.open();
    }

    protected uploadFile(
        file: File,
        targetUri: URI,
        token: CancellationToken,
        leaveInTemp: boolean | undefined,
        onProgress: (total: number, done: number) => void
    ): {
        /**
         * Promise that resolves once the uploading is finished.
         *
         * Rejects on network error.
         * Rejects if status is not OK (200).
         * Rejects if cancelled.
         */
        upload: Promise<void>
        /**
         * Promise that resolves after the uploading step, once the server answers back.
         *
         * Rejects on network error.
         * Rejects if status is not OK (200).
         * Rejects if cancelled.
         */
        response: Promise<void>
    } {
        const data = new FormData();
        data.set('uri', targetUri.toString(true));
        data.set('file', file);
        if (leaveInTemp) {
            data.set('leaveInTemp', 'true');
        }
        // TODO: Use Fetch API once it supports upload monitoring.
        const xhr = new XMLHttpRequest();
        token.onCancellationRequested(() => xhr.abort());
        const upload = new Promise<void>((resolve, reject) => {
            this.registerEvents(xhr.upload, unregister => ({
                progress: (event: ProgressEvent<XMLHttpRequestEventTarget>) => {
                    if (event.total === event.loaded) {
                        unregister();
                        resolve();
                    } else {
                        onProgress(event.total, event.loaded);
                    }
                },
                abort: () => {
                    unregister();
                    reject(cancelled());
                },
                error: () => {
                    unregister();
                    reject(new Error('POST upload error'));
                },
                // `load` fires once the response is received, not when the upload is finished.
                // `resolve` should be called earlier within `progress` but this is a safety catch.
                load: () => {
                    unregister();
                    if (xhr.status === 200) {
                        resolve();
                    } else {
                        reject(new Error(`POST request failed: ${xhr.status} ${xhr.statusText}`));
                    }
                },
            }));
        });
        const response = new Promise<void>((resolve, reject) => {
            this.registerEvents(xhr, unregister => ({
                abort: () => {
                    unregister();
                    reject(cancelled());
                },
                error: () => {
                    unregister();
                    reject(new Error('POST request error'));
                },
                load: () => {
                    unregister();
                    if (xhr.status === 200) {
                        resolve();
                    } else if (xhr.status === 500 && xhr.statusText !== xhr.response) {
                        // internal error with cause message
                        // see packages/filesystem/src/node/node-file-upload-service.ts
                        reject(new Error(`Internal server error: ${xhr.response}`));
                    } else {
                        reject(new Error(`POST request failed: ${xhr.status} ${xhr.statusText}`));
                    }
                }
            }));
        });
        xhr.open('POST', this.getUploadUrl(), /* async: */ true);
        xhr.send(data);
        return {
            upload,
            response
        };
    }

    /**
     * Utility function to attach events and get a callback to unregister those.
     *
     * You may not call `unregister` in the same tick as `register` is invoked.
     */
    protected registerEvents(
        target: EventTarget,
        register: (unregister: () => void) => Record<string, EventListenerOrEventListenerObject>
    ): void {
        const events = register(() => {
            for (const [event, fn] of Object.entries(events)) {
                target.removeEventListener(event, fn);
            }
        });
        for (const [event, fn] of Object.entries(events)) {
            target.addEventListener(event, fn);
        }
    }

    protected async withProgress<T>(
        cb: (progress: Progress, token: CancellationToken) => Promise<T>,
        { text }: FileUploadProgressParams = { text: nls.localize('theia/filesystem/uploadFiles', 'Uploading Files') }
    ): Promise<T> {
        const cancellationSource = new CancellationTokenSource();
        const { token } = cancellationSource;
        const progress = await this.messageService.showProgress(
            { text, options: { cancelable: true } },
            () => cancellationSource.cancel()
        );
        try {
            return await cb(progress, token);
        } finally {
            progress.cancel();
        }
    }

    protected async index(targetUri: URI, source: FileUploadService.Source, context: FileUploadService.Context): Promise<void> {
        if (source instanceof FormData) {
            await this.indexFormData(targetUri, source, context);
        } else if (source instanceof DataTransfer) {
            await this.indexDataTransfer(targetUri, source, context);
        } else {
            await this.indexCustomDataTransfer(targetUri, source, context);
        }
    }

    protected async indexFormData(targetUri: URI, formData: FormData, context: FileUploadService.Context): Promise<void> {
        for (const entry of formData.getAll(FileUploadService.UPLOAD)) {
            if (entry instanceof File) {
                await this.indexFile(targetUri, entry, context);
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

    protected async indexCustomDataTransfer(targetUri: URI, dataTransfer: CustomDataTransfer, context: FileUploadService.Context): Promise<void> {
        for (const [_, item] of dataTransfer) {
            const fileInfo = item.asFile();
            if (fileInfo) {
                await this.indexFile(targetUri, new File([await fileInfo.data()], fileInfo.id), context);
            }
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
    export type Source = FormData | DataTransfer | CustomDataTransfer;
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
        onDidUpload?: (uri: string) => void,
        leaveInTemp?: boolean
    }
}
