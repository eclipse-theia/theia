/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// based on https://github.com/microsoft/vscode/blob/04c36be045a94fee58e5f8992d3e3fd980294a84/src/vs/platform/files/node/diskFileSystemProvider.ts

/* eslint-disable no-null/no-null */
/* eslint-disable @typescript-eslint/no-shadow */

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { basename, dirname, normalize, join } from 'path';
import { v4 } from 'uuid';
import * as os from 'os';
import * as fs from 'fs';
import {
    mkdir, open, close, read, write, fdatasync, Stats,
    lstat, stat, readdir, readFile, exists, chmod,
    rmdir, unlink, rename, futimes, truncate
} from 'fs';
import { promisify } from 'util';
import URI from '@theia/core/lib/common/uri';
import { Path } from '@theia/core/lib/common/path';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { OS, isWindows } from '@theia/core/lib/common/os';
import { retry } from '@theia/core/lib/common/promise-util';
import {
    FileSystemProviderWithFileReadWriteCapability, FileSystemProviderWithOpenReadWriteCloseCapability, FileSystemProviderWithFileFolderCopyCapability,
    FileSystemProviderCapabilities,
    Stat,
    FileType,
    FileWriteOptions,
    createFileSystemProviderError,
    FileSystemProviderErrorCode,
    FileOpenOptions,
    FileDeleteOptions,
    FileOverwriteOptions,
    FileSystemProviderError,
    FileChange,
    WatchOptions,
    FileUpdateOptions, FileUpdateResult, FileReadStreamOptions
} from '../common/files';
import { FileSystemWatcherServer } from '../common/filesystem-watcher-protocol';
import trash = require('trash');
import { TextDocumentContentChangeEvent } from '@theia/core/shared/vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { EncodingService } from '@theia/core/lib/common/encoding-service';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { ReadableStreamEvents, newWriteableStream } from '@theia/core/lib/common/stream';
import { CancellationToken } from '@theia/core/lib/common/cancellation';
import { readFileIntoStream } from '../common/io';

export namespace DiskFileSystemProvider {
    export interface StatAndLink {

        // The stats of the file. If the file is a symbolic
        // link, the stats will be of that target file and
        // not the link itself.
        // If the file is a symbolic link pointing to a non
        // existing file, the stat will be of the link and
        // the `dangling` flag will indicate this.
        stat: fs.Stats;

        // Will be provided if the resource is a symbolic link
        // on disk. Use the `dangling` flag to find out if it
        // points to a resource that does not exist on disk.
        symbolicLink?: { dangling: boolean };
    }
}

@injectable()
export class DiskFileSystemProvider implements Disposable,
    FileSystemProviderWithFileReadWriteCapability,
    FileSystemProviderWithOpenReadWriteCloseCapability,
    FileSystemProviderWithFileFolderCopyCapability {

    private readonly BUFFER_SIZE = 64 * 1024;

    private readonly onDidChangeFileEmitter = new Emitter<readonly FileChange[]>();
    readonly onDidChangeFile = this.onDidChangeFileEmitter.event;

    private readonly onFileWatchErrorEmitter = new Emitter<void>();
    readonly onFileWatchError = this.onFileWatchErrorEmitter.event;

    protected readonly toDispose = new DisposableCollection(
        this.onDidChangeFileEmitter
    );

    @inject(FileSystemWatcherServer)
    protected readonly watcher: FileSystemWatcherServer;

    @inject(EncodingService)
    protected readonly encodingService: EncodingService;

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.watcher);
        this.watcher.setClient({
            onDidFilesChanged: params => this.onDidChangeFileEmitter.fire(params.changes.map(({ uri, type }) => ({
                resource: new URI(uri),
                type
            }))),
            onError: () => this.onFileWatchErrorEmitter.fire()
        });
    }

    // #region File Capabilities

    readonly onDidChangeCapabilities = Event.None;

    protected _capabilities: FileSystemProviderCapabilities | undefined;
    get capabilities(): FileSystemProviderCapabilities {
        if (!this._capabilities) {
            this._capabilities =
                FileSystemProviderCapabilities.FileReadWrite |
                FileSystemProviderCapabilities.FileOpenReadWriteClose |
                FileSystemProviderCapabilities.FileReadStream |
                FileSystemProviderCapabilities.FileFolderCopy |
                FileSystemProviderCapabilities.Access |
                FileSystemProviderCapabilities.Trash |
                FileSystemProviderCapabilities.Update;

            if (OS.type() === OS.Type.Linux) {
                this._capabilities |= FileSystemProviderCapabilities.PathCaseSensitive;
            }
        }

        return this._capabilities;
    }

    // #endregion

    // #region File Metadata Resolving

    async stat(resource: URI): Promise<Stat> {
        try {
            const { stat, symbolicLink } = await this.statLink(this.toFilePath(resource)); // cannot use fs.stat() here to support links properly

            return {
                type: this.toType(stat, symbolicLink),
                ctime: stat.birthtime.getTime(), // intentionally not using ctime here, we want the creation time
                mtime: stat.mtime.getTime(),
                size: stat.size
            };
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }

    async access(resource: URI, mode?: number): Promise<void> {
        try {
            await promisify(fs.access)(this.toFilePath(resource), mode);
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }

    async fsPath(resource: URI): Promise<string> {
        return FileUri.fsPath(resource);
    }

    protected async statLink(path: string): Promise<DiskFileSystemProvider.StatAndLink> {

        // First stat the link
        let lstats: Stats | undefined;
        try {
            lstats = await promisify(lstat)(path);

            // Return early if the stat is not a symbolic link at all
            if (!lstats.isSymbolicLink()) {
                return { stat: lstats };
            }
        } catch (error) {
            /* ignore - use stat() instead */
        }

        // If the stat is a symbolic link or failed to stat, use fs.stat()
        // which for symbolic links will stat the target they point to
        try {
            const stats = await promisify(stat)(path);

            return { stat: stats, symbolicLink: lstats?.isSymbolicLink() ? { dangling: false } : undefined };
        } catch (error) {

            // If the link points to a non-existing file we still want
            // to return it as result while setting dangling: true flag
            if (error.code === 'ENOENT' && lstats) {
                return { stat: lstats, symbolicLink: { dangling: true } };
            }

            throw error;
        }
    }

    async readdir(resource: URI): Promise<[string, FileType][]> {
        try {
            const children = await promisify(fs.readdir)(this.toFilePath(resource));

            const result: [string, FileType][] = [];
            await Promise.all(children.map(async child => {
                try {
                    const stat = await this.stat(resource.resolve(child));
                    result.push([child, stat.type]);
                } catch (error) {
                    console.trace(error); // ignore errors for individual entries that can arise from permission denied
                }
            }));

            return result;
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }

    private toType(entry: Stats, symbolicLink?: { dangling: boolean }): FileType {
        // Signal file type by checking for file / directory, except:
        // - symbolic links pointing to non-existing files are FileType.Unknown
        // - files that are neither file nor directory are FileType.Unknown
        let type: FileType;
        if (symbolicLink?.dangling) {
            type = FileType.Unknown;
        } else if (entry.isFile()) {
            type = FileType.File;
        } else if (entry.isDirectory()) {
            type = FileType.Directory;
        } else {
            type = FileType.Unknown;
        }

        // Always signal symbolic link as file type additionally
        if (symbolicLink) {
            type |= FileType.SymbolicLink;
        }

        return type;
    }

    // #endregion

    // #region File Reading/Writing

    async readFile(resource: URI): Promise<Uint8Array> {
        try {
            const filePath = this.toFilePath(resource);

            return await promisify(readFile)(filePath);
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }

    readFileStream(resource: URI, opts: FileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> {
        const stream = newWriteableStream<Uint8Array>(data => BinaryBuffer.concat(data.map(data => BinaryBuffer.wrap(data))).buffer);

        readFileIntoStream(this, resource, stream, data => data.buffer, {
            ...opts,
            bufferSize: this.BUFFER_SIZE
        }, token);

        return stream;
    }

    async writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
        let handle: number | undefined = undefined;
        try {
            const filePath = this.toFilePath(resource);

            // Validate target unless { create: true, overwrite: true }
            if (!opts.create || !opts.overwrite) {
                const fileExists = await promisify(exists)(filePath);
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
            throw this.toFileSystemProviderError(error);
        } finally {
            if (typeof handle === 'number') {
                await this.close(handle);
            }
        }
    }

    private mapHandleToPos: Map<number, number> = new Map();

    private writeHandles: Set<number> = new Set();
    private canFlush: boolean = true;

    async open(resource: URI, opts: FileOpenOptions): Promise<number> {
        try {
            const filePath = this.toFilePath(resource);

            let flags: string | undefined = undefined;
            if (opts.create) {
                if (isWindows && await promisify(exists)(filePath)) {
                    try {
                        // On Windows and if the file exists, we use a different strategy of saving the file
                        // by first truncating the file and then writing with r+ flag. This helps to save hidden files on Windows
                        // (see https://github.com/Microsoft/vscode/issues/931) and prevent removing alternate data streams
                        // (see https://github.com/Microsoft/vscode/issues/6363)
                        await promisify(truncate)(filePath, 0);

                        // After a successful truncate() the flag can be set to 'r+' which will not truncate.
                        flags = 'r+';
                    } catch (error) {
                        console.trace(error);
                    }
                }

                // we take opts.create as a hint that the file is opened for writing
                // as such we use 'w' to truncate an existing or create the
                // file otherwise. we do not allow reading.
                if (!flags) {
                    flags = 'w';
                }
            } else {
                // otherwise we assume the file is opened for reading
                // as such we use 'r' to neither truncate, nor create
                // the file.
                flags = 'r';
            }

            const handle = await promisify(open)(filePath, flags);

            // remember this handle to track file position of the handle
            // we init the position to 0 since the file descriptor was
            // just created and the position was not moved so far (see
            // also http://man7.org/linux/man-pages/man2/open.2.html -
            // "The file offset is set to the beginning of the file.")
            this.mapHandleToPos.set(handle, 0);

            // remember that this handle was used for writing
            if (opts.create) {
                this.writeHandles.add(handle);
            }

            return handle;
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }

    async close(fd: number): Promise<void> {
        try {

            // remove this handle from map of positions
            this.mapHandleToPos.delete(fd);

            // if a handle is closed that was used for writing, ensure
            // to flush the contents to disk if possible.
            if (this.writeHandles.delete(fd) && this.canFlush) {
                try {
                    await promisify(fdatasync)(fd);
                } catch (error) {
                    // In some exotic setups it is well possible that node fails to sync
                    // In that case we disable flushing and log the error to our logger
                    this.canFlush = false;
                    console.error(error);
                }
            }

            return await promisify(close)(fd);
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }

    async read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
        const normalizedPos = this.normalizePos(fd, pos);

        let bytesRead: number | null = null;
        try {
            const result = await promisify(read)(fd, data, offset, length, normalizedPos);

            if (typeof result === 'number') {
                bytesRead = result; // node.d.ts fail
            } else {
                bytesRead = result.bytesRead;
            }

            return bytesRead;
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        } finally {
            this.updatePos(fd, normalizedPos, bytesRead);
        }
    }

    private normalizePos(fd: number, pos: number): number | null {

        // when calling fs.read/write we try to avoid passing in the "pos" argument and
        // rather prefer to pass in "null" because this avoids an extra seek(pos)
        // call that in some cases can even fail (e.g. when opening a file over FTP -
        // see https://github.com/microsoft/vscode/issues/73884).
        //
        // as such, we compare the passed in position argument with our last known
        // position for the file descriptor and use "null" if they match.
        if (pos === this.mapHandleToPos.get(fd)) {
            return null;
        }

        return pos;
    }

    private updatePos(fd: number, pos: number | null, bytesLength: number | null): void {
        const lastKnownPos = this.mapHandleToPos.get(fd);
        if (typeof lastKnownPos === 'number') {

            // pos !== null signals that previously a position was used that is
            // not null. node.js documentation explains, that in this case
            // the internal file pointer is not moving and as such we do not move
            // our position pointer.
            //
            // Docs: "If position is null, data will be read from the current file position,
            // and the file position will be updated. If position is an integer, the file position
            // will remain unchanged."
            if (typeof pos === 'number') {
                // do not modify the position
            } else if (typeof bytesLength === 'number') {
                this.mapHandleToPos.set(fd, lastKnownPos + bytesLength);
            } else {
                this.mapHandleToPos.delete(fd);
            }
        }
    }

    async write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
        // we know at this point that the file to write to is truncated and thus empty
        // if the write now fails, the file remains empty. as such we really try hard
        // to ensure the write succeeds by retrying up to three times.
        return retry(() => this.doWrite(fd, pos, data, offset, length), 100 /* ms delay */, 3 /* retries */);
    }

    private async doWrite(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
        const normalizedPos = this.normalizePos(fd, pos);

        let bytesWritten: number | null = null;
        try {
            const result = await promisify(write)(fd, data, offset, length, normalizedPos);

            if (typeof result === 'number') {
                bytesWritten = result; // node.d.ts fail
            } else {
                bytesWritten = result.bytesWritten;
            }

            return bytesWritten;
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        } finally {
            this.updatePos(fd, normalizedPos, bytesWritten);
        }
    }

    // #endregion

    // #region Move/Copy/Delete/Create Folder

    async mkdir(resource: URI): Promise<void> {
        try {
            await promisify(mkdir)(this.toFilePath(resource));
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }

    async delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
        try {
            const filePath = this.toFilePath(resource);

            await this.doDelete(filePath, opts);
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }

    protected async doDelete(filePath: string, opts: FileDeleteOptions): Promise<void> {
        if (!opts.useTrash) {
            if (opts.recursive) {
                await this.rimraf(filePath);
            } else {
                await promisify(unlink)(filePath);
            }
        } else {
            await trash(filePath);
        }
    }

    protected rimraf(path: string): Promise<void> {
        if (new Path(path).isRoot) {
            throw new Error('rimraf - will refuse to recursively delete root');
        }
        return this.rimrafMove(path);
    }

    protected async rimrafMove(path: string): Promise<void> {
        try {
            const pathInTemp = join(os.tmpdir(), v4());
            try {
                await promisify(rename)(path, pathInTemp);
            } catch (error) {
                return this.rimrafUnlink(path); // if rename fails, delete without tmp dir
            }

            // Delete but do not return as promise
            this.rimrafUnlink(pathInTemp);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }

    protected async rimrafUnlink(path: string): Promise<void> {
        try {
            const stat = await promisify(lstat)(path);

            // Folder delete (recursive) - NOT for symbolic links though!
            if (stat.isDirectory() && !stat.isSymbolicLink()) {

                // Children
                const children = await promisify(readdir)(path);
                await Promise.all(children.map(child => this.rimrafUnlink(join(path, child))));

                // Folder
                await promisify(rmdir)(path);
            } else {

                // chmod as needed to allow for unlink
                const mode = stat.mode;
                if (!(mode & 128)) { // 128 === 0200
                    await promisify(chmod)(path, mode | 128);
                }

                return promisify(unlink)(path);
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }

    async rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        const fromFilePath = this.toFilePath(from);
        const toFilePath = this.toFilePath(to);

        if (fromFilePath === toFilePath) {
            return; // simulate node.js behaviour here and do a no-op if paths match
        }

        try {

            // Ensure target does not exist
            await this.validateTargetDeleted(from, to, 'move', opts.overwrite);

            // Move
            await this.move(fromFilePath, toFilePath);
        } catch (error) {

            // rewrite some typical errors that can happen especially around symlinks
            // to something the user can better understand
            if (error.code === 'EINVAL' || error.code === 'EBUSY' || error.code === 'ENAMETOOLONG') {
                error = new Error(`Unable to move '${basename(fromFilePath)}' into '${basename(dirname(toFilePath))}' (${error.toString()}).`);
            }

            throw this.toFileSystemProviderError(error);
        }
    }

    protected async move(source: string, target: string): Promise<void> {
        if (source === target) {
            return Promise.resolve();
        }

        async function updateMtime(path: string): Promise<void> {
            const stat = await promisify(lstat)(path);
            if (stat.isDirectory() || stat.isSymbolicLink()) {
                return Promise.resolve(); // only for files
            }

            const fd = await promisify(open)(path, 'a');
            try {
                await promisify(futimes)(fd, stat.atime, new Date());
            } catch (error) {
                // ignore
            }

            return promisify(close)(fd);
        }

        try {
            await promisify(rename)(source, target);
            await updateMtime(target);
        } catch (error) {

            // In two cases we fallback to classic copy and delete:
            //
            // 1.) The EXDEV error indicates that source and target are on different devices
            // In this case, fallback to using a copy() operation as there is no way to
            // rename() between different devices.
            //
            // 2.) The user tries to rename a file/folder that ends with a dot. This is not
            // really possible to move then, at least on UNC devices.
            if (source.toLowerCase() !== target.toLowerCase() && error.code === 'EXDEV' || source.endsWith('.')) {
                await this.doCopy(source, target);
                await this.rimraf(source);
                await updateMtime(target);
            } else {
                throw error;
            }
        }
    }

    async copy(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        const fromFilePath = this.toFilePath(from);
        const toFilePath = this.toFilePath(to);

        if (fromFilePath === toFilePath) {
            return; // simulate node.js behaviour here and do a no-op if paths match
        }

        try {

            // Ensure target does not exist
            await this.validateTargetDeleted(from, to, 'copy', opts.overwrite);

            // Copy
            await this.doCopy(fromFilePath, toFilePath);
        } catch (error) {

            // rewrite some typical errors that can happen especially around symlinks
            // to something the user can better understand
            if (error.code === 'EINVAL' || error.code === 'EBUSY' || error.code === 'ENAMETOOLONG') {
                error = new Error(`Unable to copy '${basename(fromFilePath)}' into '${basename(dirname(toFilePath))}' (${error.toString()}).`);
            }

            throw this.toFileSystemProviderError(error);
        }
    }

    private async validateTargetDeleted(from: URI, to: URI, mode: 'move' | 'copy', overwrite?: boolean): Promise<void> {
        const isPathCaseSensitive = !!(this.capabilities & FileSystemProviderCapabilities.PathCaseSensitive);

        const fromFilePath = this.toFilePath(from);
        const toFilePath = this.toFilePath(to);

        let isSameResourceWithDifferentPathCase = false;
        if (!isPathCaseSensitive) {
            isSameResourceWithDifferentPathCase = fromFilePath.toLowerCase() === toFilePath.toLowerCase();
        }

        if (isSameResourceWithDifferentPathCase && mode === 'copy') {
            throw createFileSystemProviderError("'File cannot be copied to same path with different path case", FileSystemProviderErrorCode.FileExists);
        }

        // handle existing target (unless this is a case change)
        if (!isSameResourceWithDifferentPathCase && await promisify(exists)(toFilePath)) {
            if (!overwrite) {
                throw createFileSystemProviderError('File at target already exists', FileSystemProviderErrorCode.FileExists);
            }

            // Delete target
            await this.delete(to, { recursive: true, useTrash: false });
        }
    }

    protected async doCopy(source: string, target: string, copiedSourcesIn?: { [path: string]: boolean }): Promise<void> {
        const copiedSources = copiedSourcesIn ? copiedSourcesIn : Object.create(null);

        const fileStat = await promisify(stat)(source);
        if (!fileStat.isDirectory()) {
            return this.doCopyFile(source, target, fileStat.mode & 511);
        }

        if (copiedSources[source]) {
            return Promise.resolve(); // escape when there are cycles (can happen with symlinks)
        }

        copiedSources[source] = true; // remember as copied

        // Create folder
        this.mkdirp(target, fileStat.mode & 511);

        // Copy each file recursively
        const files = await promisify(readdir)(source);
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            await this.doCopy(join(source, file), join(target, file), copiedSources);
        }
    }

    protected async mkdirp(path: string, mode?: number): Promise<void> {
        const mkdir = async () => {
            try {
                await promisify(fs.mkdir)(path, mode);
            } catch (error) {

                // ENOENT: a parent folder does not exist yet
                if (error.code === 'ENOENT') {
                    throw error;
                }

                // Any other error: check if folder exists and
                // return normally in that case if its a folder
                let targetIsFile = false;
                try {
                    const fileStat = await promisify(fs.stat)(path);
                    targetIsFile = !fileStat.isDirectory();
                } catch (statError) {
                    throw error; // rethrow original error if stat fails
                }

                if (targetIsFile) {
                    throw new Error(`'${path}' exists and is not a directory.`);
                }
            }
        };

        // stop at root
        if (path === dirname(path)) {
            return;
        }

        try {
            await mkdir();
        } catch (error) {

            // ENOENT: a parent folder does not exist yet, continue
            // to create the parent folder and then try again.
            if (error.code === 'ENOENT') {
                await this.mkdirp(dirname(path), mode);

                return mkdir();
            }

            // Any other error
            throw error;
        }
    }

    protected doCopyFile(source: string, target: string, mode: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const reader = fs.createReadStream(source);
            const writer = fs.createWriteStream(target, { mode });

            let finished = false;
            const finish = (error?: Error) => {
                if (!finished) {
                    finished = true;

                    // in error cases, pass to callback
                    if (error) {
                        return reject(error);
                    }

                    // we need to explicitly chmod because of https://github.com/nodejs/node/issues/1104
                    fs.chmod(target, mode, error => error ? reject(error) : resolve());
                }
            };

            // handle errors properly
            reader.once('error', error => finish(error));
            writer.once('error', error => finish(error));

            // we are done (underlying fd has been closed)
            writer.once('close', () => finish());

            // start piping
            reader.pipe(writer);
        });
    }

    // #endregion

    // #region File Watching

    watch(resource: URI, opts: WatchOptions): Disposable {
        const watcherService = this.watcher;
        /**
         * Disposable handle. Can be disposed early (before the watcher is allocated.)
         */
        const handle = {
            disposed: false,
            watcherId: undefined as number | undefined,
            dispose(): void {
                if (this.disposed) {
                    return;
                }
                if (this.watcherId !== undefined) {
                    watcherService.unwatchFileChanges(this.watcherId);
                }
                this.disposed = true;
            },
        };
        watcherService.watchFileChanges(resource.toString(), {
            // Convert from `files.WatchOptions` to internal `watcher-protocol.WatchOptions`:
            ignored: opts.excludes
        }).then(watcherId => {
            if (handle.disposed) {
                watcherService.unwatchFileChanges(watcherId);
            } else {
                handle.watcherId = watcherId;
            }
        });
        this.toDispose.push(handle);
        return handle;
    }

    // #endregion

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
            throw this.toFileSystemProviderError(error);
        }
    }

    // #region Helpers

    protected toFilePath(resource: URI): string {
        return normalize(FileUri.fsPath(resource));
    }

    private toFileSystemProviderError(error: NodeJS.ErrnoException): FileSystemProviderError {
        if (error instanceof FileSystemProviderError) {
            return error; // avoid double conversion
        }

        let code: FileSystemProviderErrorCode;
        switch (error.code) {
            case 'ENOENT':
                code = FileSystemProviderErrorCode.FileNotFound;
                break;
            case 'EISDIR':
                code = FileSystemProviderErrorCode.FileIsADirectory;
                break;
            case 'ENOTDIR':
                code = FileSystemProviderErrorCode.FileNotADirectory;
                break;
            case 'EEXIST':
                code = FileSystemProviderErrorCode.FileExists;
                break;
            case 'EPERM':
            case 'EACCES':
                code = FileSystemProviderErrorCode.NoPermissions;
                break;
            default:
                code = FileSystemProviderErrorCode.Unknown;
        }

        return createFileSystemProviderError(error, code);
    }

    // #endregion

    dispose(): void {
        this.toDispose.dispose();
    }
}
