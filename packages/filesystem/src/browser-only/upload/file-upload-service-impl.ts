// *****************************************************************************
// Copyright (C) 2025 Maksim Kachurin
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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { CancellationTokenSource, CancellationToken, checkCancelled, isCancelled } from '@theia/core/lib/common/cancellation';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { MessageService } from '@theia/core/lib/common/message-service';
import { Progress } from '@theia/core/lib/common/message-service-protocol';
import throttle = require('@theia/core/shared/lodash.throttle');
import { Semaphore } from 'async-mutex';
import { FileService } from '../../browser/file-service';
import { ConfirmDialog, Dialog } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import type { CustomDataTransfer, FileUploadParams, FileUploadProgressParams, FileUploadResult, FileUploadService } from '../../common/upload/file-upload';
import { FileSystemPreferences } from '../../common/filesystem-preferences';

interface UploadState {
    total: number;
    done: number;
    uploaded?: boolean;
    failed?: boolean;
}

@injectable()
export class FileUploadServiceImpl implements FileUploadService {

    static TARGET = 'target';
    static UPLOAD = 'upload';

    protected readonly onDidUploadEmitter = new Emitter<string[]>();
    protected uploadForm: FileUploadService.Form;
    protected deferredUpload?: Deferred<FileUploadResult>;

    @inject(FileSystemPreferences)
    protected fileSystemPreferences: FileSystemPreferences;

    @inject(FileService)
    protected fileService: FileService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    get onDidUpload(): Event<string[]> {
        return this.onDidUploadEmitter.event;
    }

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
        targetInput.name = FileUploadServiceImpl.TARGET;
        targetInput.classList.add('theia-input');

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.classList.add('theia-input');
        fileInput.name = FileUploadServiceImpl.UPLOAD;
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
                // clean up for reuse
                fileInput.value = '';
                const targetUri = new URI(<string>source.get(FileUploadServiceImpl.TARGET));
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
        const { source, onDidUpload } = params;
        if (source) {
            return this.withProgress(
                (progress, token) => this.uploadAll(
                    typeof targetUri === 'string' ? new URI(targetUri) : targetUri,
                    { source, progress, token, onDidUpload }
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

    protected async withProgress<T>(
        cb: (progress: Progress, token: CancellationToken) => Promise<T>,
        { text }: FileUploadProgressParams = { text: nls.localize('theia/filesystem/uploadFiles', 'Saving Files') }
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

    protected async uploadAll(targetUri: URI, params: FileUploadService.UploadParams): Promise<FileUploadResult> {

        const status = new Map<File, UploadState>();
        const result: FileUploadResult = {
            uploaded: []
        };

        const report = throttle(() => {
            const total = status.size;
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
        }, 100);

        const uploads: Promise<void>[] = [];
        const uploadSemaphore = new Semaphore(this.maxConcurrentUploads);

        try {
            await this.index(targetUri, params.source, {
                token: params.token,
                progress: params.progress,
                accept: async item => {
                    const isFileExists = await this.fileService.exists(item.uri);
                    
                    if (isFileExists) {
                        if (!await this.confirmOverwrite(item.uri)) {
                            return;
                        }
                        
                        await this.fileService.delete(item.uri);
                    }

                    status.set(item.file, { total: item.file.size, done: 0 });
                    report();

                    uploads.push(uploadSemaphore.runExclusive(async () => {
                        checkCancelled(params.token);
                        try {
                            const entry = status.get(item.file);

                            await this.uploadFile(item.file, item.uri, params.token, (total, done) => {
                                if (entry) {
                                    entry.total = total;
                                    entry.done = done;
                                    report();
                                }
                            });

                            checkCancelled(params.token);
                            // File uploaded
                            result.uploaded.push(item.uri.toString(true));

                            if (entry) {
                                entry.uploaded = true;
                                report();
                            }

                            if (params.onDidUpload) {
                                params.onDidUpload(item.uri.toString(true));
                            }
                        } catch (error) {
                            const entry = status.get(item.file);
                            if (entry) {
                                entry.failed = true;
                                report();
                            }
                            throw error;
                        }
                    }));
                }
            });

            checkCancelled(params.token);
            await Promise.all(uploads);
        } catch (error) {
            uploadSemaphore.cancel();
            if (!isCancelled(error)) {
                this.messageService.error(nls.localize('theia/filesystem/uploadFailed', 'An error occurred while saving a file. {0}', error.message));
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

    /**
     * Upload (write) a file directly to the filesystem
     */
    protected async uploadFile(
        file: File,
        targetUri: URI,
        token: CancellationToken,
        onProgress: (total: number, done: number) => void
    ): Promise<void> {
        checkCancelled(token);

        const totalSize = file.size;
        const chunkSize = 10 * 1024 * 1024; // 10MB chunks
        let offset = 0;
        let bytesProcessed = 0;
        const chunks: Uint8Array[] = [];

        onProgress(totalSize, 0);

        try {
            // Read file in chunks to avoid memory issues
            while (offset < totalSize) {
                checkCancelled(token);

                const end = Math.min(offset + chunkSize, totalSize);
                const slice = file.slice(offset, end);
                const arrayBuffer = await slice.arrayBuffer();
                const chunk = new Uint8Array(arrayBuffer);

                chunks.push(chunk);
                bytesProcessed += chunk.length;

                // Update progress
                const readProgress = Math.floor((bytesProcessed / totalSize) * 0.1 * totalSize);
                onProgress(totalSize, readProgress);

                offset = end;
            }

            checkCancelled(token);

            // Combine chunks and write to filesystem
            const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
            const combinedBuffer = new Uint8Array(totalLength);
            let position = 0;

            for (const chunk of chunks) {
                combinedBuffer.set(chunk, position);
                position += chunk.length;
            }

            const binaryBuffer = BinaryBuffer.wrap(combinedBuffer);
            await this.fileService.writeFile(targetUri, binaryBuffer);

            onProgress(totalSize, totalSize);

        } catch (error) {
            throw error;
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
        for (const entry of formData.getAll(FileUploadServiceImpl.UPLOAD)) {
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
            const entry = items[i].webkitGetAsEntry();

            if (entry) {
                entries.push(entry as WebKitEntry);
            }
        }
        await this.indexEntries(targetUri, entries, context);
    }

    protected async indexEntry(targetUri: URI, entry: WebKitEntry, context: FileUploadService.Context): Promise<void> {
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
     * Read directory entries
     */
    protected async indexDirectoryEntry(targetUri: URI, entry: WebKitDirectoryEntry, context: FileUploadService.Context): Promise<void> {
        checkCancelled(context.token);
        const newTargetUri = targetUri.resolve(entry.name);

        return new Promise<void>((resolve, reject) => {
            const reader = entry.createReader();

            const getEntries = () => reader.readEntries(async results => {
                try {
                    if (!context.token.isCancellationRequested && results?.length) {
                        await this.indexEntries(newTargetUri, results, context);
                        // continue reading
                        getEntries();
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
            const entry = entries[i];

            if (entry) {
                await this.indexEntry(targetUri, entry, context);
            }
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
