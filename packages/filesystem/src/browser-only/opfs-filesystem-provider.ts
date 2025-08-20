// *****************************************************************************
// Copyright (C) 2024 EclipseSource and others.
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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import {
    FileChange, FileChangeType, FileDeleteOptions,
    FileOverwriteOptions, FileSystemProviderCapabilities,
    FileSystemProviderError,
    FileSystemProviderErrorCode,
    FileSystemProviderWithFileReadWriteCapability,
    FileSystemProviderWithFileFolderCopyCapability,
    FileSystemProviderWithOpenReadWriteCloseCapability,
    FileSystemProviderWithUpdateCapability,
    FileType, FileWriteOptions, Stat, WatchOptions, createFileSystemProviderError,
    FileOpenOptions, FileUpdateOptions, FileUpdateResult
} from '../common/files';
import { Emitter, Event, URI, Disposable, DisposableCollection } from '@theia/core';
import { EncodingService } from '@theia/core/lib/common/encoding-service';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { TextDocumentContentChangeEvent } from '@theia/core/shared/vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createWorker, type OPFSFileSystem } from 'opfs-worker';
import { OPFSInitialization } from './opfs-filesystem-initialization';

@injectable()
export class OPFSFileSystemProvider implements FileSystemProviderWithFileReadWriteCapability,
    FileSystemProviderWithFileFolderCopyCapability,
    FileSystemProviderWithOpenReadWriteCloseCapability,
    FileSystemProviderWithUpdateCapability,
    Disposable {
    capabilities: FileSystemProviderCapabilities =
        FileSystemProviderCapabilities.FileReadWrite |
        FileSystemProviderCapabilities.FileOpenReadWriteClose |
        FileSystemProviderCapabilities.FileFolderCopy |
        FileSystemProviderCapabilities.Update;

    onDidChangeCapabilities: Event<void> = Event.None;

    private readonly onDidChangeFileEmitter = new Emitter<readonly FileChange[]>();
    readonly onDidChangeFile = this.onDidChangeFileEmitter.event;
    onFileWatchError: Event<void> = Event.None;

    @inject(OPFSInitialization)
    protected readonly initialization: OPFSInitialization;

    @inject(EncodingService)
    protected readonly encodingService: EncodingService;

    public fs!: OPFSFileSystem;
    private broadcastChannel!: BroadcastChannel;
    private initialized: Promise<true>;

    protected readonly toDispose = new DisposableCollection(
        this.onDidChangeFileEmitter
    );

    @postConstruct()
    protected init(): void {
        const setup = async (): Promise<true> => {
            const rootHandler = await this.initialization.getRootDirectory();
            // NOTE: FileSystemDirectoryHandle here for backward compatibility
            const root = (typeof rootHandler === 'string') ? rootHandler : (rootHandler as FileSystemDirectoryHandle).name;

            this.broadcastChannel = this.initialization.getBroadcastChannel();

            // Set up file change listening via BroadcastChannel
            this.broadcastChannel.onmessage = this.handleFileSystemChange.bind(this);

            // Initialize the file system
            this.fs = await createWorker({
                root,
                hashAlgorithm: false,
                broadcastChannel: this.broadcastChannel.name,
            });

            await this.initialization.initializeFS(new Proxy(this, {
                get(target, prop, receiver): unknown {
                    if (prop === 'initialized') {
                        return Promise.resolve(true);
                    }
                    return Reflect.get(target, prop, receiver);
                }
            }));
            return true;
        };

        this.initialized = setup();
    }

    watch(resource: URI, opts: WatchOptions): Disposable {
        if (!resource || !resource.path) {
            return Disposable.NULL;
        }

        const path = resource.path.toString();

        this.fs.watch(path, {
            recursive: opts.recursive,
            exclude: opts.excludes,
        });

        return Disposable.create(() => {
            this.fs.unwatch(path);
        });
    }

    async exists(resource: URI): Promise<boolean> {
        if (!resource || !resource.path) {
            return false;
        }

        await this.initialized;

        try {
            return await this.fs.exists(resource.path.toString());
        } catch (error) {
            return false;
        }
    }

    async stat(resource: URI): Promise<Stat> {
        if (!resource || !resource.path) {
            throw createFileSystemProviderError('Invalid resource URI', FileSystemProviderErrorCode.FileNotFound);
        }

        await this.initialized;

        try {
            const path = resource.path.toString();
            const stats = await this.fs.stat(path);

            return {
                type: stats.isDirectory ? FileType.Directory : FileType.File,
                ctime: new Date(stats.ctime).getTime(),
                mtime: new Date(stats.mtime).getTime(),
                size: stats.size
            };
        } catch (error) {
            throw toFileSystemProviderError(error as Error);
        }
    }

    async mkdir(resource: URI): Promise<void> {
        if (!resource || !resource.path) {
            throw createFileSystemProviderError('Invalid resource URI', FileSystemProviderErrorCode.FileNotFound);
        }

        await this.initialized;

        try {
            const path = resource.path.toString();

            await this.fs.mkdir(path, { recursive: true });
            this.onDidChangeFileEmitter.fire([{ resource, type: FileChangeType.ADDED }]);
        } catch (error) {
            throw toFileSystemProviderError(error as Error);
        }
    }

    async readdir(resource: URI): Promise<[string, FileType][]> {
        if (!resource || !resource.path) {
            throw createFileSystemProviderError('Invalid resource URI', FileSystemProviderErrorCode.FileNotFound);
        }

        await this.initialized;

        try {
            const path = resource.path.toString();
            const entries = await this.fs.readDir(path);

            if (Array.isArray(entries)) {
                return entries.map(entry => [
                    entry.name,
                    entry.isFile ? FileType.File : FileType.Directory
                ]);
            }

            return [];
        } catch (error) {
            throw toFileSystemProviderError(error as Error);
        }
    }

    async delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
        if (!resource || !resource.path) {
            throw createFileSystemProviderError('Invalid resource URI', FileSystemProviderErrorCode.FileNotFound);
        }

        await this.initialized;

        try {
            const path = resource.path.toString();

            await this.fs.remove(path, { recursive: opts.recursive });
        } catch (error) {
            throw toFileSystemProviderError(error as Error);
        }
    }

    async rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        if (!from || !from.path || !to || !to.path) {
            throw createFileSystemProviderError('Invalid source or destination URI', FileSystemProviderErrorCode.FileNotFound);
        }

        await this.initialized;

        try {
            const fromPath = from.path.toString();
            const toPath = to.path.toString();

            await this.fs.rename(fromPath, toPath, {
                overwrite: opts.overwrite,
            });
        } catch (error) {
            throw toFileSystemProviderError(error as Error);
        }
    }

    async copy(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        if (!from || !from.path || !to || !to.path) {
            throw createFileSystemProviderError('Invalid source or destination URI', FileSystemProviderErrorCode.FileNotFound);
        }

        await this.initialized;

        try {
            const fromPath = from.path.toString();
            const toPath = to.path.toString();

            await this.fs.copy(fromPath, toPath, {
                overwrite: opts.overwrite,
                recursive: true,
            });
        } catch (error) {
            throw toFileSystemProviderError(error as Error);
        }
    }

    async readFile(resource: URI): Promise<Uint8Array> {
        if (!resource || !resource.path) {
            throw createFileSystemProviderError('Invalid resource URI', FileSystemProviderErrorCode.FileNotFound);
        }

        await this.initialized;

        try {
            return await this.fs.readFile(resource.path.toString(), 'binary') as Uint8Array;
        } catch (error) {
            throw toFileSystemProviderError(error as Error);
        }
    }

    async writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
        await this.initialized;

        let handle: number | undefined = undefined;

        if (!resource || !resource.path) {
            throw createFileSystemProviderError('Invalid resource URI', FileSystemProviderErrorCode.FileNotFound);
        }

        if (!content || !(content instanceof Uint8Array)) {
            throw createFileSystemProviderError('Invalid content: must be Uint8Array', FileSystemProviderErrorCode.Unknown);
        }

        try {
            const path = resource.path.toString();

            if (!opts.create || !opts.overwrite) {
                const fileExists = await this.fs.exists(path);

                if (fileExists) {
                    if (!opts.overwrite) {
                        throw createFileSystemProviderError('File already exists', FileSystemProviderErrorCode.FileExists);
                    }
                } else {
                    if (!opts.create) {
                        throw createFileSystemProviderError('File does not exist', FileSystemProviderErrorCode.FileNotFound);
                    }
                }
            }

            // Open
            handle = await this.open(resource, { create: true });

            // Write content at once
            await this.write(handle, 0, content, 0, content.byteLength);
        } catch (error) {
            throw toFileSystemProviderError(error as Error);
        } finally {
            if (typeof handle === 'number') {
                await this.close(handle);
            }
        }
    }

    // #region Open/Read/Write/Close Operations

    async open(resource: URI, opts: FileOpenOptions): Promise<number> {
        await this.initialized;

        if (!resource || !resource.path) {
            throw createFileSystemProviderError('Invalid resource URI', FileSystemProviderErrorCode.FileNotFound);
        }

        try {
            const path = resource.path.toString();
            const fileExists = await this.fs.exists(path);

            if (!opts.create && !fileExists) {
                throw createFileSystemProviderError('File does not exist', FileSystemProviderErrorCode.FileNotFound);
            }

            const fd = await this.fs.open(path, {
                create: opts.create,
            });

            return fd;
        } catch (error) {
            throw toFileSystemProviderError(error as Error);
        }
    }

    async close(fd: number): Promise<void> {
        try {
            await this.fs.close(fd);
        } catch (error) {
            throw toFileSystemProviderError(error as Error);
        }
    }

    async read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
        try {
            const result = await this.fs.read(fd, data, offset, length, pos);

            return result.bytesRead;
        } catch (error) {
            throw toFileSystemProviderError(error as Error);
        }
    }

    async write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
        try {
            return await this.fs.write(fd, data, offset, length, pos, true);
        } catch (error) {
            throw toFileSystemProviderError(error as Error);
        }
    }

    // #endregion

    // #region Text File Updates

    async updateFile(resource: URI, changes: TextDocumentContentChangeEvent[], opts: FileUpdateOptions): Promise<FileUpdateResult> {
        try {
            const content = await this.readFile(resource);
            const decoded = this.encodingService.decode(BinaryBuffer.wrap(content), opts.readEncoding);
            const newContent = TextDocument.update(TextDocument.create('', '', 1, decoded), changes, 2).getText();
            const encoding = await this.encodingService.toResourceEncoding(opts.writeEncoding, {
                overwriteEncoding: opts.overwriteEncoding,
                read: async length => {
                    const fd = await this.open(resource, { create: false });
                    try {
                        const data = new Uint8Array(length);
                        await this.read(fd, 0, data, 0, length);
                        return data;
                    } finally {
                        await this.close(fd);
                    }
                }
            });
            const encoded = this.encodingService.encode(newContent, encoding);
            await this.writeFile(resource, encoded.buffer, { create: false, overwrite: true });
            const stat = await this.stat(resource);
            return Object.assign(stat, { encoding: encoding.encoding });
        } catch (error) {
            throw toFileSystemProviderError(error as Error);
        }
    }

    // #endregion

    private async handleFileSystemChange(event: MessageEvent): Promise<void> {
        if (!event.data?.path) {
            return;
        }

        const resource = new URI('file://' + event.data.path);
        let changeType: FileChangeType;

        if (event.data.type === 'created') {
            changeType = FileChangeType.ADDED;
        } else if (event.data.type === 'deleted') {
            changeType = FileChangeType.DELETED;
        } else {
            changeType = FileChangeType.UPDATED;
        }

        this.onDidChangeFileEmitter.fire([{ resource, type: changeType }]);
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}

function toFileSystemProviderError(error: Error): FileSystemProviderError {
    if (error instanceof FileSystemProviderError) {
        return error;
    }

    let code: FileSystemProviderErrorCode;

    if (error.name === 'OPFSError' || error.name === 'FileNotFoundError') {
        code = FileSystemProviderErrorCode.FileNotFound;
    } else if (error.name === 'PermissionError') {
        code = FileSystemProviderErrorCode.NoPermissions;
    } else if (error.name === 'StorageError') {
        code = FileSystemProviderErrorCode.FileTooLarge;
    } else if (error.name === 'PathError') {
        code = FileSystemProviderErrorCode.FileNotADirectory;
    } else {
        code = FileSystemProviderErrorCode.Unknown;
    }

    return createFileSystemProviderError(error, code);
}
