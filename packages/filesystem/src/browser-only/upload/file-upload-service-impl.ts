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
import { minimatch } from 'minimatch';

import type { FileUploadService } from '../../common/upload/file-upload';

interface UploadState {
    uploaded?: boolean;
    failed?: boolean;
}

interface UploadFilesParams {
    source: FileUploadService.Source,
    progress: Progress,
    token: CancellationToken,
    onDidUpload?: (uri: string) => void,
}

@injectable()
export class FileUploadServiceImpl implements FileUploadService {

    static TARGET = 'target';
    static UPLOAD = 'upload';

    protected readonly onDidUploadEmitter = new Emitter<string[]>();
    protected uploadForm: FileUploadService.Form;
    protected deferredUpload?: Deferred<FileUploadService.UploadResult>;

    @inject(FileSystemPreferences)
    protected fileSystemPreferences: FileSystemPreferences;

    @inject(FileService)
    protected fileService: FileService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    private readonly ignorePatterns: string[] = [];

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
                    (progress, token) => this.uploadFiles(targetUri, { source, progress, token, onDidUpload })
                ).then(resolve, reject);
            }
        });

        return { targetInput, fileInput };
    }

    async upload(targetUri: string | URI, params: FileUploadService.UploadParams): Promise<FileUploadService.UploadResult> {
        const { source, onDidUpload } = params || {};

        if (source) {
            return this.withProgress(
                (progress, token) => this.uploadFiles(
                    typeof targetUri === 'string' ? new URI(targetUri) : targetUri,
                    { source, progress, token, onDidUpload }
                )
            );
        }
        this.deferredUpload = new Deferred<FileUploadService.UploadResult>();
        this.uploadForm.targetInput.value = String(targetUri);
        this.uploadForm.fileInput.click();
        this.uploadForm.onDidUpload = onDidUpload;
        return this.deferredUpload.promise;
    }

    protected async withProgress<T>(
        cb: (progress: Progress, token: CancellationToken) => Promise<T>
    ): Promise<T> {
        const cancellationSource = new CancellationTokenSource();
        const { token } = cancellationSource;
        const text = nls.localize('theia/filesystem/uploadFiles', 'Saving Files');
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
    protected async uploadFiles(targetUri: URI, params: UploadFilesParams): Promise<FileUploadService.UploadResult> {
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
            const files = await this.enumerateFiles(targetUri, params.source, params.token);

            for (const { file, uri } of files) {
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
     * Normalize sources into an array of { file, uri } objects
     */
    protected async enumerateFiles(targetUri: URI, source: FileUploadService.Source, token: CancellationToken): Promise<{ file: File; uri: URI }[]> {
        checkCancelled(token);

        if (source instanceof FormData) {
            // Handle FormData declaratively
            const files = source.getAll(FileUploadServiceImpl.UPLOAD)
                .filter((entry): entry is File => entry instanceof File)
                .filter(entry => this.shouldIncludeFile(entry.name))
                .map(entry => ({
                    file: entry,
                    uri: targetUri.resolve(entry.name)
                }));

            return files;
        } else if (source instanceof DataTransfer) {
            // Use WebKit Entries for folder traversal
            if (source.items && this.supportsWebKitEntries()) {
                // Collect all files first
                const allFiles: { file: File; uri: URI }[] = [];
                const items = Array.from(source.items);
                const entries = items.map(item => item.webkitGetAsEntry()).filter((entry): entry is WebKitEntry => !!entry);

                for (let i = 0; i < entries.length; i++) {
                    const entry = entries[i];
                    const filesFromEntry = await this.traverseEntry(targetUri, entry!, token);

                    allFiles.push(...filesFromEntry);
                }

                return allFiles;
            } else {
                // Fall back to flat file list
                return Array.from(source.files)
                    .filter((file): file is File => !!file)
                    .filter(file => this.shouldIncludeFile(file.name))
                    .map(file => ({
                        file,
                        uri: targetUri.resolve(file.name)
                    }));
            }
        } else {
            // Handle CustomDataTransfer declaratively
            const files = await Promise.all(
                Array.from(source)
                    .map(async ([, item]) => {
                        const fileData = item.asFile();
                        if (fileData && this.shouldIncludeFile(fileData.name)) {
                            const data = await fileData.data();
                            return {
                                file: new File([data as BlobPart], fileData.name, { type: 'application/octet-stream' }),
                                uri: targetUri.resolve(fileData.name)
                            };
                        }
                        return undefined;
                    })
            );

            return files.filter(Boolean) as { file: File; uri: URI }[];
        }
    }

    /**
     * Traverse WebKit Entries (files and folders)
     */
    protected async traverseEntry(
        base: URI,
        entry: WebKitEntry,
        token: CancellationToken
    ): Promise<{ file: File; uri: URI }[]> {
        if (!entry) {
            return [];
        }

        // Skip system entries
        if (!this.shouldIncludeFile(entry.name)) {
            return [];
        }

        // directory
        if (entry.isDirectory) {
            const dir = entry as WebKitDirectoryEntry;
            const newBase = base.resolve(dir.name);

            const entries = await this.readAllEntries(dir, token);
            checkCancelled(token);

            const chunks = await Promise.all(
                entries.map(sub => this.traverseEntry(newBase, sub, token))
            );

            return chunks.flat();
        }

        // file
        const fileEntry = entry as WebKitFileEntry;
        const file = await this.readFileEntry(fileEntry, token);
        checkCancelled(token);

        return [{ file, uri: base.resolve(entry.name) }];
    }

    /**
     * Read all entries from a WebKit directory entry
     */
    protected async readAllEntries(
        dir: WebKitDirectoryEntry,
        token: CancellationToken
    ): Promise<WebKitEntry[]> {
        const reader = dir.createReader();
        const out: WebKitEntry[] = [];

        while (true) {
            checkCancelled(token);

            const batch = await new Promise<WebKitEntry[]>((resolve, reject) =>
                reader.readEntries(resolve, reject)
            );

            if (!batch.length) {break; }
            out.push(...batch);

            // yield to the event loop to keep UI responsive
            await Promise.resolve();
        }
        return out;
    }

    /**
     * Read a file from a WebKit file entry
     */
    protected async readFileEntry(
        fileEntry: WebKitFileEntry,
        token: CancellationToken
    ): Promise<File> {
        checkCancelled(token);
        try {
            return await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject));
        } catch (err) {
            throw err;
        }
    }

    protected supportsWebKitEntries(): boolean {
        return typeof DataTransferItem.prototype.webkitGetAsEntry === 'function';
    }

    protected shouldIncludeFile(path: string): boolean {
        return !this.ignorePatterns.some((pattern: string) => minimatch(path, pattern));
    }
}
