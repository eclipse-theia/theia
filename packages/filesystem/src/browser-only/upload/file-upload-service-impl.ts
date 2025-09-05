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
import { FileSystemPreferences } from '../../common/filesystem-preferences';
import { fileToStream } from '@theia/core/lib/common/stream';

import type { FileUploadParams, FileUploadProgressParams, FileUploadResult, FileUploadService } from '../../common/upload/file-upload';

interface UploadState {
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
                    (progress, token) => this.uploadFiles(targetUri, { source, progress, token, onDidUpload }),
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
                (progress, token) => this.uploadFiles(
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
     * Upload all files to the filesystem
     */
    protected async uploadFiles(targetUri: URI, params: FileUploadService.UploadParams): Promise<FileUploadResult> {
        const status = new Map<URI, UploadState>();

        const report = throttle(() => {
            const list = Array.from(status.values());
            const total = list.length;
            const done = list.filter(item => item.uploaded).length;

            params.progress.report({
                message: nls.localize('theia/filesystem/processedOutOf', 'Processed {0} out of {1}', done, total),
                work: { total, done }
            });
        }, 100);

        const uploads: Promise<void>[] = [];
        const uploadSemaphore = new Semaphore(this.maxConcurrentUploads);

        try {
            for await (const { file, uri } of this.enumerateFiles(targetUri, params.source as FormData | DataTransfer, params.token)) {
                checkCancelled(params.token);

                // Check exists and confirm overwrite before adding to queue
                if (await this.fileService.exists(uri) && !await this.confirmOverwrite(uri)) {
                    continue;
                }

                status.set(uri, {
                    uploaded: false
                });
                report();

                uploads.push(uploadSemaphore.runExclusive(async () => {
                    const entry = status.get(uri);

                    try {
                        checkCancelled(params.token);

                        await this.uploadFile(file, uri);

                        if (entry) {
                            entry.uploaded = true;
                            report();
                        }

                        if (params.onDidUpload) {
                            params.onDidUpload(uri.toString(true));
                        }
                    } catch (error) {
                        if (entry) {
                            entry.failed = true;
                            report();
                        }
                        throw error;
                    }
                }));
            }

            checkCancelled(params.token);
            await Promise.all(uploads);
        } catch (error) {
            uploadSemaphore.cancel();

            if (!isCancelled(error)) {
                this.messageService.error(nls.localize('theia/filesystem/uploadFailed', 'An error occurred while saving a file. {0}', error.message));
                throw error;
            }
        }

        const uploaded = Array.from(status.keys()).map(uri => uri.toString(true));

        this.onDidUploadEmitter.fire(uploaded);

        return { uploaded };
    }

    /**
     * Upload (write) a file directly to the filesystem
     */
    protected async uploadFile(
        file: File,
        targetUri: URI
    ): Promise<void> {
        await this.fileService.writeFile(targetUri, fileToStream(file));
    }

    /**
     * Normalize sources into a stream of { file, uri } objects
     */
    protected async *enumerateFiles(targetUri: URI, source: FormData | DataTransfer, token: CancellationToken): AsyncGenerator<{ file: File; uri: URI }> {
        checkCancelled(token);

        if (source instanceof FormData) {
            // Handle FormData
            for (const entry of source.getAll(FileUploadServiceImpl.UPLOAD)) {
                if (entry instanceof File) {
                    yield {
                        file: entry,
                        uri: targetUri.resolve(entry.name)
                    };
                }
            }
        } else if (source instanceof DataTransfer) {
            // Use WebKit Entries for folder traversal
            if (source.items && this.supportsWebKitEntries()) {
                for (let i = 0; i < source.items.length; i++) {
                    const item = source.items[i];
                    const entry = item.webkitGetAsEntry?.();
                    if (entry) {
                        yield* this.traverseEntry(targetUri, entry, token);
                    }
                }
            } else {
                // Fall back to flat file list
                for (let i = 0; i < source.files.length; i++) {
                    const file = source.files[i];
                    if (file) {
                        yield {
                            file,
                            uri: targetUri.resolve(file.name)
                        };
                    }
                }
            }
        }
    }

    /**
     * Traverse WebKit Entries (files and folders)
     */
    protected async *traverseEntry(base: URI, entry: WebKitEntry, token: CancellationToken): AsyncGenerator<{ file: File; uri: URI }> {
        checkCancelled(token);

        if (!entry) {
            return;
        }

        if (entry.isDirectory) {
            // Handle directory
            const directoryEntry = entry as WebKitDirectoryEntry;
            const newBase = base.resolve(directoryEntry.name);
            const reader = directoryEntry.createReader();

            const readEntries = () => new Promise<WebKitEntry[]>(
                (resolve, reject) => reader.readEntries(resolve, reject)
            );

            let results = await readEntries();

            while (results.length > 0) {
                for (const subEntry of results) {
                    yield* this.traverseEntry(newBase, subEntry, token);
                }
                results = await readEntries();
            }
        } else {
            // Handle file
            const fileEntry = entry as WebKitFileEntry;
            const file = await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject));

            yield {
                file,
                uri: base.resolve(entry.name)
            };
        }
    }

    protected supportsWebKitEntries(): boolean {
        return typeof DataTransferItem.prototype.webkitGetAsEntry === 'function';
    }
}
