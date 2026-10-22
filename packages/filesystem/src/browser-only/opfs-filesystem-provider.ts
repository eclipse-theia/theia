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

import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import {
    FileChange, FileChangeType, FileDeleteOptions,
    FileOverwriteOptions, FileSystemProviderCapabilities,
    FileSystemProviderError,
    FileSystemProviderErrorCode,
    FileSystemProviderWithFileReadWriteCapability,
    FileSystemProviderWithFileFolderCopyCapability,
    FileSystemProviderWithOpenReadWriteCloseCapability,
    FileType, FileWriteOptions, Stat, WatchOptions, createFileSystemProviderError,
    FileOpenOptions, FileUpdateOptions, FileUpdateResult,
    type FileReadStreamOptions
} from '../common/files';
import { Emitter, Event, URI, Disposable, DisposableCollection, ILogger, type CancellationToken } from '@theia/core';
import { EncodingService } from '@theia/core/lib/common/encoding-service';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { TextDocumentContentChangeEvent } from '@theia/core/shared/vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createOPFS, WatchEventType, type FileStat, type OPFSError, type OPFSFacade, type OPFSOptions, type WatchEvent } from 'opfs-worker';
import { OPFSInitialization } from './opfs-filesystem-initialization';
import { ReadableStreamEvents, newWriteableStream } from '@theia/core/lib/common/stream';
import { readFileIntoStream } from '../common/io';
import { Path } from '@theia/core/lib/common/path';

@injectable()
export class OPFSFileSystemProvider implements Disposable,
    FileSystemProviderWithFileReadWriteCapability,
    FileSystemProviderWithOpenReadWriteCloseCapability,
    FileSystemProviderWithFileFolderCopyCapability {

    private readonly BUFFER_SIZE = 64 * 1024;

    capabilities: FileSystemProviderCapabilities =
        FileSystemProviderCapabilities.FileReadWrite |
        FileSystemProviderCapabilities.FileOpenReadWriteClose |
        FileSystemProviderCapabilities.FileFolderCopy |
        FileSystemProviderCapabilities.Update;

    onDidChangeCapabilities: Event<void> = Event.None;

    private readonly onDidChangeFileEmitter = new Emitter<readonly FileChange[]>();

    readonly onDidChangeFile = this.onDidChangeFileEmitter.event;
    readonly onFileWatchError: Event<void> = Event.None;

    @inject(OPFSInitialization)
    protected readonly initialization: OPFSInitialization;

    @inject(EncodingService)
    protected readonly encodingService: EncodingService;

    @inject(ILogger) @named('filesystem:OPFSFileSystemProvider')
    protected readonly logger: ILogger;

    protected readonly fileLockTimeout: number = 10_000;

    private fs!: OPFSFacade;
    private initialized: Promise<true>;
    private readonly fileLocks = new Map<string, { acquired: Promise<void>, released: Promise<void> }>();
    private readonly openFileLocks = new Map<number, Disposable>();
    private lastWatchEvent: WatchEvent | undefined;

    protected readonly toDispose = new DisposableCollection(
        this.onDidChangeFileEmitter
    );

    /**
     * Initializes the OPFS file system provider
     */
    @postConstruct()
    protected init(): void {
        const setup = async (): Promise<true> => {
            const root = await this.initialization.getRootDirectory();

            this.fs = this.createFileSystem({
                root,
                broadcastChannel: this.initialization.getBroadcastChannel(),
                // opfs-worker's worker and facade derive different default namespaces for a root without a
                // leading slash, and the facade then drops every change event.
                namespace: `opfs-worker:${root}`,
                hashAlgorithm: false,
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

    protected createFileSystem(options: OPFSOptions): OPFSFacade {
        return createOPFS(options);
    }

    /**
     * Watches a resource for file system changes
     */
    watch(resource: URI, opts: WatchOptions): Disposable {
        if (!resource || !resource.path) {
            return Disposable.NULL;
        }

        const unwatch = this.fs.watch(formatPath(resource), {
            recursive: opts.recursive,
            exclude: opts.excludes,
        }, event => this.handleFileSystemChange(event));

        return Disposable.create(unwatch);
    }

    /**
     * Creates an index from the map of entries
     */
    async createIndex(entries: Map<URI, Uint8Array>): Promise<void> {
        const arrayEntries: [string, Uint8Array][] = [];
        for (const [uri, content] of entries) {
            arrayEntries.push([formatPath(uri), content]);
        }
        await this.fs.importFiles(arrayEntries);
    }

    /**
     * Retrieves the current file system index
     */
    async index(): Promise<Map<URI, Stat>> {
        const opfsIndex = await this.fs.index();
        const index = new Map<URI, Stat>();

        for (const [path, stats] of opfsIndex.entries()) {
            const uri = new URI(path);
            index.set(uri, formatStat(stats));
        }

        return index;
    }

    /**
     * Clears the file system
     */
    async clear(): Promise<void> {
        try {
            await this.fs.clear();
        } catch (error) {
            throw toFileSystemProviderError(error as Error | OPFSError);
        }
    }

    /**
     * Checks if a resource exists
     */
    async exists(resource: URI): Promise<boolean> {
        if (!resource || !resource.path) {
            return false;
        }

        await this.initialized;

        try {
            return await this.fs.exists(formatPath(resource));
        } catch (error) {
            throw toFileSystemProviderError(error as Error | OPFSError);
        }
    }

    /**
     * Gets file system statistics for a resource
     */
    async stat(resource: URI): Promise<Stat> {
        if (!resource || !resource.path) {
            throw createFileSystemProviderError('Invalid resource URI', FileSystemProviderErrorCode.FileNotFound);
        }

        await this.initialized;

        try {
            const path = formatPath(resource);
            const stats = await this.fs.stat(path);

            return formatStat(stats);
        } catch (error) {
            throw toFileSystemProviderError(error as Error | OPFSError);
        }
    }

    /**
     * Creates a directory
     */
    async mkdir(resource: URI): Promise<void> {
        if (!resource || !resource.path) {
            throw createFileSystemProviderError('Invalid resource URI', FileSystemProviderErrorCode.FileNotFound);
        }

        await this.initialized;

        try {
            const path = formatPath(resource);

            await this.fs.mkdir(path, { recursive: true });
            this.onDidChangeFileEmitter.fire([{ resource, type: FileChangeType.ADDED }]);
        } catch (error) {
            throw toFileSystemProviderError(error as Error | OPFSError);
        }
    }

    /**
     * Reads directory contents
     */
    async readdir(resource: URI): Promise<[string, FileType][]> {
        if (!resource || !resource.path) {
            throw createFileSystemProviderError('Invalid resource URI', FileSystemProviderErrorCode.FileNotFound);
        }

        await this.initialized;

        try {
            const path = formatPath(resource);
            const entries = await this.fs.readDir(path);

            return entries.map(entry => [
                entry.name,
                entry.isFile ? FileType.File : FileType.Directory
            ]);
        } catch (error) {
            throw toFileSystemProviderError(error as Error | OPFSError);
        }
    }

    /**
     * Deletes a resource
     */
    async delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
        if (!resource || !resource.path) {
            throw createFileSystemProviderError('Invalid resource URI', FileSystemProviderErrorCode.FileNotFound);
        }

        await this.initialized;

        try {
            const path = formatPath(resource);

            await this.fs.remove(path, { recursive: opts.recursive });
        } catch (error) {
            throw toFileSystemProviderError(error as Error | OPFSError);
        }
    }

    /**
     * Renames a resource from one location to another
     */
    async rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        if (!from || !from.path || !to || !to.path) {
            throw createFileSystemProviderError('Invalid source or destination URI', FileSystemProviderErrorCode.FileNotFound);
        }

        await this.initialized;

        try {
            const fromPath = formatPath(from);
            const toPath = formatPath(to);

            await this.fs.rename(fromPath, toPath, {
                overwrite: opts.overwrite,
            });
        } catch (error) {
            throw toFileSystemProviderError(error as Error | OPFSError);
        }
    }

    /**
     * Copies a resource from one location to another
     */
    async copy(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        if (!from || !from.path || !to || !to.path) {
            throw createFileSystemProviderError('Invalid source or destination URI', FileSystemProviderErrorCode.FileNotFound);
        }

        await this.initialized;

        try {
            const fromPath = formatPath(from);
            const toPath = formatPath(to);

            await this.fs.copy(fromPath, toPath, {
                overwrite: opts.overwrite,
                recursive: true,
            });
        } catch (error) {
            throw toFileSystemProviderError(error as Error | OPFSError);
        }
    }

    /**
     * Reads file content as binary data
     */
    async readFile(resource: URI): Promise<Uint8Array> {
        if (!resource || !resource.path) {
            throw createFileSystemProviderError('Invalid resource URI', FileSystemProviderErrorCode.FileNotFound);
        }

        await this.initialized;

        const path = formatPath(resource);
        const lock = await this.lockFile(path);
        try {
            return await this.fs.readFile(path, 'binary');
        } catch (error) {
            throw toFileSystemProviderError(error as Error | OPFSError);
        } finally {
            lock.dispose();
        }
    }

    /**
     * Reads file content as a stream
     */
    readFileStream(resource: URI, opts: FileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> {
        const stream = newWriteableStream<Uint8Array>(chunks => BinaryBuffer.concat(chunks.map(chunk => BinaryBuffer.wrap(chunk))).buffer);

        readFileIntoStream(this, resource, stream, data => data.buffer, {
            ...opts,
            bufferSize: this.BUFFER_SIZE
        }, token);

        return stream;
    }

    /**
     * Writes binary content to a file
     */
    async writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
        await this.initialized;

        if (!resource || !resource.path) {
            throw createFileSystemProviderError('Invalid resource URI', FileSystemProviderErrorCode.FileNotFound);
        }

        if (!content || !(content instanceof Uint8Array)) {
            throw createFileSystemProviderError('Invalid content: must be Uint8Array', FileSystemProviderErrorCode.Unknown);
        }

        const path = formatPath(resource);
        const lock = await this.lockFile(path);
        try {
            if (!opts.create || !opts.overwrite) {
                const fileExists = await this.fs.exists(path);

                if (fileExists) {
                    if (!opts.overwrite) {
                        throw createFileSystemProviderError('File already exists', FileSystemProviderErrorCode.FileExists);
                    }
                } else if (!opts.create) {
                    throw createFileSystemProviderError('File does not exist', FileSystemProviderErrorCode.FileNotFound);
                }
            }

            await this.fs.writeFile(path, content);
        } catch (error) {
            throw toFileSystemProviderError(error as Error | OPFSError);
        } finally {
            lock.dispose();
        }
    }

    // #region Open/Read/Write/Close Operations

    /**
     * Opens a file and returns a file descriptor
     */
    async open(resource: URI, opts: FileOpenOptions): Promise<number> {
        await this.initialized;

        if (!resource || !resource.path) {
            throw createFileSystemProviderError('Invalid resource URI', FileSystemProviderErrorCode.FileNotFound);
        }

        const path = formatPath(resource);
        const lock = await this.lockFile(path);
        try {
            const fileExists = await this.fs.exists(path);

            if (!opts.create && !fileExists) {
                throw createFileSystemProviderError('File does not exist', FileSystemProviderErrorCode.FileNotFound);
            }

            const fd = await this.fs.open(path, {
                create: opts.create,
                truncate: opts.create
            });
            this.openFileLocks.set(fd, lock);

            return fd;
        } catch (error) {
            lock.dispose();
            throw toFileSystemProviderError(error as Error | OPFSError);
        }
    }

    /**
     * Closes a file descriptor
     */
    async close(fd: number): Promise<void> {
        try {
            await this.fs.close(fd);
        } catch (error) {
            throw toFileSystemProviderError(error as Error | OPFSError);
        } finally {
            this.openFileLocks.get(fd)?.dispose();
            this.openFileLocks.delete(fd);
        }
    }

    /**
     * Reads data from a file descriptor
     */
    async read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
        try {
            const result = await this.fs.read(fd, data, offset, length, pos);

            return result.bytesRead;
        } catch (error) {
            throw toFileSystemProviderError(error as Error | OPFSError);
        }
    }

    /**
     * Writes data to a file descriptor
     */
    async write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
        try {
            return await this.fs.write(fd, data, offset, length, pos, true);
        } catch (error) {
            throw toFileSystemProviderError(error as Error | OPFSError);
        }
    }

    // #endregion

    // #region Text File Updates

    /**
     * Updates a text file with content changes
     */
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
            throw toFileSystemProviderError(error as Error | OPFSError);
        }
    }

    // #endregion

    /**
     * Waits for earlier accesses to the file to finish, since OPFS allows one sync access handle per file.
     * The wait is bounded by `fileLockTimeout` so that a descriptor that is never closed does not block the file for good.
     */
    protected async lockFile(path: string): Promise<Disposable> {
        const previous = this.fileLocks.get(path);
        const acquired = new Deferred();
        const released = new Deferred();
        const current = { acquired: acquired.promise, released: released.promise };
        this.fileLocks.set(path, current);

        if (previous) {
            // Start the timeout only once the previous access is in, so that waiters queued behind
            // an access that never finishes go ahead one at a time rather than all together.
            await previous.acquired;
            let timer: ReturnType<typeof setTimeout> | undefined;
            const done = await Promise.race([
                previous.released.then(() => true),
                new Promise<false>(resolve => timer = setTimeout(() => resolve(false), this.fileLockTimeout))
            ]);
            clearTimeout(timer);
            if (!done) {
                this.logger.warn(`Gave up waiting for an earlier access to ${path} after ${this.fileLockTimeout} ms.`);
            }
        }
        acquired.resolve();

        return Disposable.create(() => {
            released.resolve();
            if (this.fileLocks.get(path) === current) {
                this.fileLocks.delete(path);
            }
        });
    }

    /**
     * Handles file system change events from opfs-worker
     */
    private handleFileSystemChange(event: WatchEvent): void {
        // opfs-worker calls the listener of every matching watch with the same event object.
        if (event === this.lastWatchEvent) {
            return;
        }
        this.lastWatchEvent = event;

        const resource = new URI('file://' + event.path);
        let changeType: FileChangeType;

        if (event.type === WatchEventType.Added) {
            changeType = FileChangeType.ADDED;
        } else if (event.type === WatchEventType.Removed) {
            changeType = FileChangeType.DELETED;
        } else {
            changeType = FileChangeType.UPDATED;
        }

        this.onDidChangeFileEmitter.fire([{ resource, type: changeType }]);
    }

    /**
     * Disposes the file system provider
     */
    dispose(): void {
        this.toDispose.dispose();
    }
}

/**
 * Formats a URI or string resource to a file system path.
 *
 * For browser-only mode with OPFS we always want POSIX-style paths,
 * regardless of the underlying platform.
 */
function formatPath(resource: URI | string): string {
    const uri = typeof resource === 'string' ? new URI(resource) : resource;
    return uri.path.fsPath(Path.Format.Posix);
}

/**
 * Creates a Stat object from OPFS stats
 */
function formatStat(stats: FileStat): Stat {
    return {
        type: stats.isDirectory ? FileType.Directory : FileType.File,
        ctime: new Date(stats.ctime).getTime(),
        mtime: new Date(stats.mtime).getTime(),
        size: stats.size
    };
}

/**
 * Converts OPFS errors to file system provider errors
 */
function toFileSystemProviderError(error: OPFSError | Error): FileSystemProviderError {
    if (error instanceof FileSystemProviderError) {
        return error;
    }

    let code: FileSystemProviderErrorCode;

    if (error.name === 'NotFoundError' || error.name === 'ENOENT') {
        code = FileSystemProviderErrorCode.FileNotFound;
    } else if (error.name === 'NotAllowedError' || error.name === 'SecurityError' || error.name === 'EACCES') {
        code = FileSystemProviderErrorCode.NoPermissions;
    } else if (error.name === 'QuotaExceededError' || error.name === 'ENOSPC') {
        code = FileSystemProviderErrorCode.FileTooLarge;
    } else if (error.name === 'PathError' || error.name === 'INVALID_PATH') {
        code = FileSystemProviderErrorCode.FileNotADirectory;
    } else {
        code = FileSystemProviderErrorCode.Unknown;
    }

    return createFileSystemProviderError(error, code);
}
