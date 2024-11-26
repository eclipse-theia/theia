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
    FileType, FileWriteOptions, Stat, WatchOptions, createFileSystemProviderError
} from '../common/files';
import { Emitter, Event, URI, Disposable, Path } from '@theia/core';
import { OPFSInitialization } from './opfs-filesystem-initialization';

/** Options to be used when traversing the file system handles */
interface CreateFileSystemHandleOptions {
    isDirectory?: boolean;
    create?: boolean;
}

@injectable()
export class OPFSFileSystemProvider implements FileSystemProviderWithFileReadWriteCapability {
    capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.FileReadWrite;
    onDidChangeCapabilities: Event<void> = Event.None;

    private readonly onDidChangeFileEmitter = new Emitter<readonly FileChange[]>();
    readonly onDidChangeFile = this.onDidChangeFileEmitter.event;
    onFileWatchError: Event<void> = Event.None;

    @inject(OPFSInitialization)
    protected readonly initialization: OPFSInitialization;

    private directoryHandle: FileSystemDirectoryHandle;
    private initialized: Promise<true>;

    @postConstruct()
    protected init(): void {
        const setup = async (): Promise<true> => {
            this.directoryHandle = await this.initialization.getRootDirectory();
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

    watch(_resource: URI, _opts: WatchOptions): Disposable {
        return Disposable.NULL;
    }

    async exists(resource: URI): Promise<boolean> {
        try {
            await this.initialized;
            await this.toFileSystemHandle(resource);
            return true;
        } catch (error) {
            return false;
        }
    }

    async stat(resource: URI): Promise<Stat> {
        try {
            await this.initialized;

            const handle = await this.toFileSystemHandle(resource);

            if (handle.kind === 'file') {
                const fileHandle = handle as FileSystemFileHandle;
                const file = await fileHandle.getFile();
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

            throw createFileSystemProviderError('Unknown file handle error', FileSystemProviderErrorCode.Unknown);

        } catch (error) {
            throw createFileSystemProviderError(`Error while accessing resource ${resource.toString()}`, FileSystemProviderErrorCode.Unknown);
        }
    }

    async mkdir(resource: URI): Promise<void> {
        await this.initialized;
        try {
            await this.toFileSystemHandle(resource, { create: true, isDirectory: true });
            this.onDidChangeFileEmitter.fire([{ resource, type: FileChangeType.ADDED }]);
        } catch (error) {
            throw toFileSystemProviderError(error, true);
        }
    }

    async readdir(resource: URI): Promise<[string, FileType][]> {
        await this.initialized;

        try {
            // Get the directory handle from the directoryHandle
            const directoryHandle = await this.toFileSystemHandle(resource, { create: false, isDirectory: true }) as FileSystemDirectoryHandle;

            const result: [string, FileType][] = [];

            // Iterate through the entries in the directory (files and subdirectories)
            for await (const [name, handle] of directoryHandle.entries()) {
                // Determine the type of the entry (file or directory)
                if (handle.kind === 'file') {
                    result.push([name, FileType.File]);
                } else if (handle.kind === 'directory') {
                    result.push([name, FileType.Directory]);
                }
            }

            return result;
        } catch (error) {
            throw toFileSystemProviderError(error, true);
        }
    }

    async delete(resource: URI, _opts: FileDeleteOptions): Promise<void> {
        await this.initialized;
        try {
            const parentURI = resource.parent;
            const parentHandle = await this.toFileSystemHandle(parentURI, { create: false, isDirectory: true });
            if (parentHandle.kind !== 'directory') {
                throw createFileSystemProviderError(new Error('Parent is not a directory'), FileSystemProviderErrorCode.FileNotADirectory);
            }
            const name = resource.path.base;
            return (parentHandle as FileSystemDirectoryHandle).removeEntry(name, { recursive: _opts.recursive });
        } catch (error) {
            throw toFileSystemProviderError(error);
        } finally {
            this.onDidChangeFileEmitter.fire([{ resource, type: FileChangeType.DELETED }]);
        }
    }

    async rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        await this.initialized;

        try {
            const fromHandle = await this.toFileSystemHandle(from);
            // Check whether the source is a file or directory
            if (fromHandle.kind === 'directory') {
                // Create the new directory and get the handle
                await this.mkdir(to);
                const toHandle = await this.toFileSystemHandle(to) as FileSystemDirectoryHandle;
                await copyDirectoryContents(fromHandle as FileSystemDirectoryHandle, toHandle);

                // Delete the old directory
                await this.delete(from, { recursive: true, useTrash: false });
            } else {
                const content = await this.readFile(from);
                await this.writeFile(to, content, { create: true, overwrite: opts.overwrite });
                await this.delete(from, { recursive: true, useTrash: false });
            }

            this.onDidChangeFileEmitter.fire([{ resource: to, type: FileChangeType.ADDED }]);
        } catch (error) {
            throw toFileSystemProviderError(error);
        }
    }

    async readFile(resource: URI): Promise<Uint8Array> {
        await this.initialized;

        try {
            // Get the file handle from the directoryHandle
            const fileHandle = await this.toFileSystemHandle(resource, { create: false, isDirectory: false }) as FileSystemFileHandle;

            // Get the file itself (which includes the content)
            const file = await fileHandle.getFile();

            // Read the file as an ArrayBuffer and convert it to Uint8Array
            const arrayBuffer = await file.arrayBuffer();
            return new Uint8Array(arrayBuffer);
        } catch (error) {
            throw toFileSystemProviderError(error, false);
        }
    }

    async writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
        await this.initialized;
        let writeableHandle: FileSystemWritableFileStream | undefined = undefined;
        try {
            // Validate target unless { create: true, overwrite: true }
            if (!opts.create || !opts.overwrite) {
                const fileExists = await this.stat(resource).then(() => true, () => false);
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

            const handle = await this.toFileSystemHandle(resource, { create: true, isDirectory: false }) as FileSystemFileHandle;

            // Open
            writeableHandle = await handle?.createWritable();

            // Write content at once
            await writeableHandle?.write(content);

            this.onDidChangeFileEmitter.fire([{ resource: resource, type: FileChangeType.UPDATED }]);
        } catch (error) {
            throw toFileSystemProviderError(error, false);
        } finally {
            if (typeof writeableHandle !== 'undefined') {
                await writeableHandle.close();
            }
        }
    }

    /**
     * Returns the FileSystemHandle for the given resource given by a URI.
     * @param resource URI/path of the resource
     * @param options Options for the creation of the handle while traversing the path
     * @returns FileSystemHandle for the given resource
     */
    private async toFileSystemHandle(resource: URI, options?: CreateFileSystemHandleOptions): Promise<FileSystemHandle> {
        const pathParts = resource.path.toString().split(Path.separator).filter(Boolean);

        return recursiveFileSystemHandle(this.directoryHandle, pathParts, options);
    }
}

// #region Helper functions
async function recursiveFileSystemHandle(handle: FileSystemHandle, pathParts: string[], options?: CreateFileSystemHandleOptions): Promise<FileSystemHandle> {
    // We reached the end of the path, this happens only when not creating
    if (pathParts.length === 0) {
        return handle;
    }
    // If there are parts left, the handle must be a directory
    if (handle.kind !== 'directory') {
        throw FileSystemProviderErrorCode.FileNotADirectory;
    }
    const dirHandle = handle as FileSystemDirectoryHandle;
    // We need to create it and thus we need to stop early to create the file or directory
    if (pathParts.length === 1 && options?.create) {
        if (options?.isDirectory) {
            return dirHandle.getDirectoryHandle(pathParts[0], { create: options.create });
        } else {
            return dirHandle.getFileHandle(pathParts[0], { create: options.create });
        }
    }

    // Continue to resolve the path
    const part = pathParts.shift()!;
    for await (const entry of dirHandle.entries()) {
        // Check the entry name in the current directory
        if (entry[0] === part) {
            return recursiveFileSystemHandle(entry[1], pathParts, options);
        }
    }

    // If we haven't found the part, we need to create it along the way
    if (options?.create) {
        const newHandle = await dirHandle.getDirectoryHandle(part, { create: true });
        return recursiveFileSystemHandle(newHandle, pathParts, options);
    }

    throw FileSystemProviderErrorCode.FileNotFound;
}

// Function to copy directory contents recursively
async function copyDirectoryContents(sourceHandle: FileSystemDirectoryHandle, destinationHandle: FileSystemDirectoryHandle): Promise<void> {
    for await (const [name, handle] of sourceHandle.entries()) {
        if (handle.kind === 'file') {
            const file = await (handle as FileSystemFileHandle).getFile();
            const newFileHandle = await destinationHandle.getFileHandle(name, { create: true });
            const writable = await newFileHandle.createWritable();
            try {
                await writable.write(await file.arrayBuffer());
            } finally {
                await writable.close();
            }
        } else if (handle.kind === 'directory') {
            const newSubDirHandle = await destinationHandle.getDirectoryHandle(name, { create: true });
            await copyDirectoryContents(handle as FileSystemDirectoryHandle, newSubDirHandle);
        }
    }
}

function toFileSystemProviderError(error: DOMException, is_dir?: boolean): FileSystemProviderError {
    if (error instanceof FileSystemProviderError) {
        return error; // avoid double conversion
    }

    let code: FileSystemProviderErrorCode;
    switch (error.name) {
        case 'NotFoundError':
            code = FileSystemProviderErrorCode.FileNotFound;
            break;
        case 'InvalidModificationError':
            code = FileSystemProviderErrorCode.FileExists;
            break;
        case 'NotAllowedError':
            code = FileSystemProviderErrorCode.NoPermissions;
            break;
        case 'TypeMismatchError':
            if (!is_dir) {
                code = FileSystemProviderErrorCode.FileIsADirectory;
            } else {
                code = FileSystemProviderErrorCode.FileNotADirectory;
            }

            break;
        case 'QuotaExceededError':
            code = FileSystemProviderErrorCode.FileTooLarge;
            break;
        default:
            code = FileSystemProviderErrorCode.Unknown;
    }

    return createFileSystemProviderError(error, code);
}
// #endregion
