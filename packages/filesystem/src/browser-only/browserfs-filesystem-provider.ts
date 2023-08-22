// *****************************************************************************
// Copyright (C) 2023 EclipseSource and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// based on https://github.com/microsoft/vscode/blob/04c36be045a94fee58e5f8992d3e3fd980294a84/src/vs/platform/files/node/diskFileSystemProvider.ts

/* eslint-disable no-null/no-null */

import { inject, injectable } from '@theia/core/shared/inversify';
import {
    FileChange, FileDeleteOptions, FileOpenOptions,
    FileOverwriteOptions, FileReadStreamOptions, FileSystemProviderCapabilities,
    FileSystemProviderError,
    FileSystemProviderErrorCode,
    FileSystemProviderWithFileReadWriteCapability,
    FileType, FileUpdateOptions, FileUpdateResult, FileWriteOptions, Stat, WatchOptions, createFileSystemProviderError
} from '../common/files';
import { Event, URI, Disposable, CancellationToken } from '@theia/core';
import { TextDocumentContentChangeEvent } from '@theia/core/shared/vscode-languageserver-protocol';
import { ReadableStreamEvents } from '@theia/core/lib/common/stream';
import { BFSRequire } from 'browserfs';
import type { FSModule } from 'browserfs/dist/node/core/FS';
import type { FileSystem } from 'browserfs/dist/node/core/file_system';
import MountableFileSystem from 'browserfs/dist/node/backend/MountableFileSystem';
import { basename, dirname, normalize } from 'path';
import Stats from 'browserfs/dist/node/core/node_fs_stats';
import { retry } from '@theia/core/lib/common/promise-util';
import { BrowserFSInitialization } from './browserfs-filesystem-initialization';

// adapted from DiskFileSystemProvider
@injectable()
export class BrowserFSFileSystemProvider implements FileSystemProviderWithFileReadWriteCapability {
    capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.FileReadWrite;
    onDidChangeCapabilities: Event<void> = Event.None;
    onDidChangeFile: Event<readonly FileChange[]> = Event.None;
    onFileWatchError: Event<void> = Event.None;
    private mapHandleToPos: Map<number, number> = new Map();
    private writeHandles: Set<number> = new Set();
    private canFlush: boolean = true;

    private fs: FSModule;
    private mountableFS: MountableFileSystem;
    private initialized: Promise<true>;

    constructor(@inject(BrowserFSInitialization) readonly initialization: BrowserFSInitialization) {
        const init = async (): Promise<true> => {
            this.mountableFS = await initialization.createMountableFileSystem();
            this.fs = BFSRequire('fs');
            await initialization.initializeFS(this.fs, new Proxy(this, {
                get(target, prop, receiver): unknown {
                    if (prop === 'initialized') {
                        return Promise.resolve(true);
                    }
                    return Reflect.get(target, prop, receiver);
                }
            }));
            return true;
        };
        this.initialized = init();
    }

    async mount(mountPoint: string, fs: FileSystem): Promise<void> {
        await this.initialized;
        this.mountableFS.mount(mountPoint, fs);
    };

    watch(_resource: URI, _opts: WatchOptions): Disposable {
        return Disposable.NULL;
    }
    async stat(resource: URI): Promise<Stat> {
        await this.initialized;
        const path = this.toFilePath(resource);

        let stats: Stats;
        try {
            stats = await this.promisify(this.fs.stat)(path) as Stats;
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
        if (stats === undefined) {
            throw new Error(`Could not read file stat for resource '${path}'`);
        }
        return {
            type: this.toType(stats, /* symbolicLink */undefined), // FIXME: missing symbolicLink
            ctime: stats.birthtime.getTime(), // intentionally not using ctime here, we want the creation time
            mtime: stats.mtime.getTime(),
            size: stats.size,
            // FIXME: missing mode, permissions
        };

    }
    async mkdir(resource: URI): Promise<void> {
        await this.initialized;
        try {
            await this.promisify(this.fs.mkdir)(this.toFilePath(resource));
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }
    async readdir(resource: URI): Promise<[string, FileType][]> {
        await this.initialized;
        try {

            const children = await this.promisify(this.fs.readdir)(this.toFilePath(resource)) as string[];
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
    async delete(resource: URI, _opts: FileDeleteOptions): Promise<void> {
        await this.initialized;
        // FIXME use options
        try {
            await this.promisify(this.fs.unlink)(this.toFilePath(resource));
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }
    async rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        await this.initialized;
        const fromFilePath = this.toFilePath(from);
        const toFilePath = this.toFilePath(to);
        if (fromFilePath === toFilePath) {
            return; // simulate node.js behaviour here and do a no-op if paths match
        }
        try {
            // assume FS is path case sensitive - correct?
            const targetExists = await this.promisify(this.fs.exists)(toFilePath);
            if (targetExists) {
                throw Error(`File '${toFilePath}' already exists.`);
            }
            if (fromFilePath === toFilePath) {
                return Promise.resolve();
            }

            await this.promisify(this.fs.rename)(fromFilePath, toFilePath);

            const stat = await this.promisify(this.fs.lstat)(toFilePath) as Stats;
            if (stat.isDirectory() || stat.isSymbolicLink()) {
                return Promise.resolve(); // only for files
            }
            const fd = await this.promisify(open)(toFilePath, 'a');
            try {
                await this.promisify(this.fs.futimes)(fd, stat.atime, new Date());
            } catch (error) {
                // ignore
            }

            this.promisify(this.fs.close)(fd);
        } catch (error) {
            // rewrite some typical errors that can happen especially around symlinks
            // to something the user can better understand
            if (error.code === 'EINVAL' || error.code === 'EBUSY' || error.code === 'ENAMETOOLONG') {
                error = new Error(`Unable to move '${basename(fromFilePath)}' into '${basename(dirname(toFilePath))}' (${error.toString()}).`);
            }

            throw this.toFileSystemProviderError(error);
        }
    }
    async copy?(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        await this.initialized;
        throw new Error('Method not implemented.');
    }
    async readFile(resource: URI): Promise<Uint8Array> {
        await this.initialized;
        try {
            const filePath = this.toFilePath(resource);
            return await this.promisify(this.fs.readFile)(filePath) as Uint8Array;
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }
    async writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
        await this.initialized;
        let handle: number | undefined = undefined;
        try {
            const filePath = this.toFilePath(resource);

            // Validate target unless { create: true, overwrite: true }
            if (!opts.create || !opts.overwrite) {
                const fileExists = await this.promisify(this.fs.exists)(filePath);
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
    readFileStream?(resource: URI, opts: FileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> {
        throw new Error('Method not implemented.');
    }
    async open(resource: URI, opts: FileOpenOptions): Promise<number> {
        await this.initialized;
        try {
            const filePath = this.toFilePath(resource);

            let flags: string | undefined = undefined;
            if (opts.create) {
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

            const handle = await this.promisify(this.fs.open)(filePath, flags) as number;

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
        await this.initialized;
        // remove this handle from map of positions
        this.mapHandleToPos.delete(fd);

        // if a handle is closed that was used for writing, ensure
        // to flush the contents to disk if possible.
        if (this.writeHandles.delete(fd) && this.canFlush) {
            try {
                await this.promisify(this.fs.fdatasync)(fd);
            } catch (error) {
                // In some exotic setups it is well possible that node fails to sync
                // In that case we disable flushing and log the error to our logger
                this.canFlush = false;
                console.error(error);
            }
        }

        await this.promisify(this.fs.close)(fd);
    }
    async read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
        await this.initialized;
        const normalizedPos = this.normalizePos(fd, pos);

        let bytesRead: number | null = null;
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result: { bytesRead: number, buffer: Uint8Array } | number = (await this.promisify(this.fs.read)(fd, data, offset, length, normalizedPos)) as any;

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
    async write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
        await this.initialized;
        // we know at this point that the file to write to is truncated and thus empty
        // if the write now fails, the file remains empty. as such we really try hard
        // to ensure the write succeeds by retrying up to three times.
        return retry(() => this.doWrite(fd, pos, data, offset, length), 100 /* ms delay */, 3 /* retries */);

    }
    private async doWrite(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
        await this.initialized;
        const normalizedPos = this.normalizePos(fd, pos);

        let bytesWritten: number | null = null;
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result: { bytesWritten: number, buffer: Uint8Array } | number = (await this.promisify(this.fs.write)(fd, data, offset, length, normalizedPos)) as any;

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
    async access?(resource: URI, mode?: number | undefined): Promise<void> {
        await this.initialized;
        throw new Error('Method not implemented.');
    }
    async fsPath?(resource: URI): Promise<string> {
        await this.initialized;
        throw new Error('Method not implemented.');
    }
    async updateFile?(resource: URI, changes: TextDocumentContentChangeEvent[], opts: FileUpdateOptions): Promise<FileUpdateResult> {
        await this.initialized;
        throw new Error('Method not implemented.');
    }

    private toFilePath(resource: URI): string {
        return normalize(resource.path.toString());
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

    // FIXME typing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private promisify<T>(f: Function): (...args: any[]) => Promise<T> {
        // eslint-disable-next-line @typescript-eslint/tslint/config, @typescript-eslint/no-explicit-any
        return function (...args: any[]) {
            return new Promise((resolve, reject) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                f(...args, (err: Error, result: T) => err ? reject(err) : resolve(result));
            });
        };
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
}
