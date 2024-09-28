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
    FileChange, FileDeleteOptions,
    FileOverwriteOptions, FileSystemProviderCapabilities,
    FileSystemProviderError,
    FileSystemProviderErrorCode,
    FileSystemProviderWithFileReadWriteCapability,
    FileType, FileWriteOptions, Stat, WatchOptions, createFileSystemProviderError
} from '../common/files';
import { Event, URI, Disposable } from '@theia/core';
import { BrowserFSInitialization } from './browserfs-filesystem-initialization';
// adapted from DiskFileSystemProvider
@injectable()
export class BrowserFSFileSystemProvider implements FileSystemProviderWithFileReadWriteCapability {
    capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.FileReadWrite;
    onDidChangeCapabilities: Event<void> = Event.None;
    onDidChangeFile: Event<readonly FileChange[]> = Event.None;
    onFileWatchError: Event<void> = Event.None;

    private directoryHandle: FileSystemDirectoryHandle;
    private initialized: Promise<true>;

    constructor(@inject(BrowserFSInitialization) readonly initialization: BrowserFSInitialization) {
        const init = async (): Promise<true> => {
            this.directoryHandle = await initialization.createMountableFileSystem();
            await initialization.initializeFS(this.directoryHandle, new Proxy(this, {
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

    watch(_resource: URI, _opts: WatchOptions): Disposable {
        return Disposable.NULL;
    }
    async stat(resource: URI): Promise<Stat> {
        await this.initialized;
        let handle = await this.toFileSystemHandle(resource);

        if (handle.kind === 'file') {
            let fileHandle = handle as FileSystemFileHandle
            let file = await fileHandle.getFile();
            return {
                type: FileType.File,
                ctime: file.lastModified,
                mtime: file.lastModified,
                size: file.size
            };
        } else if (handle.kind === 'directory') {
            return {
                type: FileType.Directory,
                ctime: 0,
                mtime: 0,
                size: 0
            };
        }
        throw new Error('Method not implemented.');
    }
    async mkdir(resource: URI): Promise<void> {
        await this.initialized;

        await this.toFileSystemHandle(resource, true, true);
    }

    async readdir(resource: URI): Promise<[string, FileType][]> {
        await this.initialized;

        try {
            // Get the directory handle from the directoryHandle
            const directoryHandle = await this.toFileSystemHandle(resource, false, true) as FileSystemDirectoryHandle;

            const result: [string, FileType][] = [];

            // Iterate through the entries in the directory (files and subdirectories)
            for await (const [name, handle] of (directoryHandle as any).entries()) {
                try {
                    // Determine the type of the entry (file or directory)
                    if (handle.kind === 'file') {
                        result.push([name, FileType.File]);
                    } else if (handle.kind === 'directory') {
                        result.push([name, FileType.Directory]);
                    }
                } catch (error) {
                    console.trace(error); // Ignore errors for individual entries
                }
            }

            console.info('readdir', resource.path.toString(), result);
            return result;
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }

    async delete(resource: URI, _opts: FileDeleteOptions): Promise<void> {
        await this.initialized;
        throw new Error('Method not implemented.');
        // FIXME use options
        // try {
        //     await this.promisify(this.fs.unlink)(this.toFilePath(resource));
        // } catch (error) {
        //     throw this.toFileSystemProviderError(error);
        // }
    }
    async rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        await this.initialized;
        // const fromFilePath = this.toFilePath(from);
        // const toFilePath = this.toFilePath(to);
        // if (fromFilePath === toFilePath) {
        //     return; // simulate node.js behaviour here and do a no-op if paths match
        // }
        // try {
        //     // assume FS is path case sensitive - correct?
        //     const targetExists = await this.promisify(this.fs.exists)(toFilePath);
        //     if (targetExists) {
        //         throw Error(`File '${toFilePath}' already exists.`);
        //     }
        //     if (fromFilePath === toFilePath) {
        //         return Promise.resolve();
        //     }

        //     await this.promisify(this.fs.rename)(fromFilePath, toFilePath);

        //     const stat = await this.promisify(this.fs.lstat)(toFilePath) as Stats;
        //     if (stat.isDirectory() || stat.isSymbolicLink()) {
        //         return Promise.resolve(); // only for files
        //     }
        //     const fd = await this.promisify(open)(toFilePath, 'a');
        //     try {
        //         await this.promisify(this.fs.futimes)(fd, stat.atime, new Date());
        //     } catch (error) {
        //         // ignore
        //     }

        //     this.promisify(this.fs.close)(fd);
        // } catch (error) {
        //     // rewrite some typical errors that can happen especially around symlinks
        //     // to something the user can better understand
        //     if (error.code === 'EINVAL' || error.code === 'EBUSY' || error.code === 'ENAMETOOLONG') {
        //         error = new Error(`Unable to move '${basename(fromFilePath)}' into '${basename(dirname(toFilePath))}' (${error.toString()}).`);
        //     }

        //     throw this.toFileSystemProviderError(error);
        // }
    }
    async copy?(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        await this.initialized;
        throw new Error('Method not implemented.');
    }
    async readFile(resource: URI): Promise<Uint8Array> {
        await this.initialized;

        try {
            // Get the file handle from the directoryHandle
            const fileHandle = await this.toFileSystemHandle(resource, false, false) as FileSystemFileHandle;

            // Get the file itself (which includes the content)
            const file = await fileHandle.getFile();

            // Read the file as an ArrayBuffer and convert it to Uint8Array
            const arrayBuffer = await file.arrayBuffer();
            return new Uint8Array(arrayBuffer);

        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }

    async writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
        // TODO implement overwrite
        await this.initialized;
        let writeableHandle: FileSystemWritableFileStream | undefined = undefined;
        try {
            let handle = await this.toFileSystemHandle(resource, true, false) as FileSystemFileHandle;

            // Open
            writeableHandle = await handle?.createWritable();

            // Write content at once
            console.info('writeFile', resource.path.toString(), content);
            await writeableHandle?.write(content);
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        } finally {
            if (typeof writeableHandle !== 'undefined') {
                await writeableHandle.close();
            }
        }
    }

    private async toFileSystemHandle(resource: URI, create?: boolean, is_dir?: boolean): Promise<FileSystemHandle> {
        const pathParts = resource.path.toString().split('/').filter(Boolean);

        return this.recursiveFileSystemHandle(this.directoryHandle, pathParts, create, is_dir);
    }

    private async recursiveFileSystemHandle(handle: FileSystemDirectoryHandle, pathParts: string[], create?: boolean, is_dir?: boolean): Promise<FileSystemHandle> {
        // We reached the end of the path, this happens only when not creating
        if (pathParts.length === 0) {
            return handle;
        }
        // We need to create it and thus we need to stop early to create the file or directory
        if (pathParts.length === 1 && create) {
            if (is_dir) {
                return handle.getDirectoryHandle(pathParts[0], { create: create });
            } else {
                return handle.getFileHandle(pathParts[0], { create: create });
            }
        }

        // Continue to resolve the path
        const part = pathParts.shift()!;
        for await (const entry of (handle as any).entries()) {
            if (entry[0] === part) {
                return this.recursiveFileSystemHandle(entry[1], pathParts, create, is_dir);
            }
        }

        // If we haven't found the part, we need to create it along the way
        if (create) {
            let newHandle = await (handle as FileSystemDirectoryHandle).getDirectoryHandle(part, { create: true });
            return this.recursiveFileSystemHandle(newHandle, pathParts, create, is_dir);
        }

        throw FileSystemProviderErrorCode.FileNotFound;
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
