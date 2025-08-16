// *****************************************************************************
// Copyright (C) 2025 EclipseSource, Maksim Kachurin and others.
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
    FileType, FileWriteOptions, Stat, WatchOptions, createFileSystemProviderError
} from '../common/files';
import { Emitter, Event, URI, Disposable } from '@theia/core';
import { createWorker, type RemoteOPFSWorker } from 'opfs-worker'; 
import { OPFSInitialization } from './opfs-filesystem-initialization';

@injectable()
export class OPFSFileSystemProvider implements FileSystemProviderWithFileReadWriteCapability, FileSystemProviderWithFileFolderCopyCapability {
    capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileFolderCopy;
    onDidChangeCapabilities: Event<void> = Event.None;

    private readonly onDidChangeFileEmitter = new Emitter<readonly FileChange[]>();
    readonly onDidChangeFile = this.onDidChangeFileEmitter.event;
    onFileWatchError: Event<void> = Event.None;

    @inject(OPFSInitialization)
    protected readonly initialization: OPFSInitialization;

    private fs!: RemoteOPFSWorker;
    private broadcastChannel!: BroadcastChannel;
    private initialized: Promise<true>;

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
                hashAlgorithm: null,
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
        
        void this.fs.watch(path, {
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
        
        try {
            await this.initialized;
            return await this.fs.exists(resource.path.toString());
        } catch (error) {
            return false;
        }
    }

    async stat(resource: URI): Promise<Stat> {
        if (!resource || !resource.path) {
            throw createFileSystemProviderError('Invalid resource URI', FileSystemProviderErrorCode.FileNotFound);
        }

        try {
            await this.initialized;

            const path = resource.path.toString();
            const stats = await this.fs.stat(path);
            
            return {
                type: stats.isDirectory ? FileType.Directory : FileType.File,
                ctime: new Date(stats.ctime).getTime(),
                mtime: new Date(stats.mtime).getTime(),
                size: stats.size
            };
        } catch (error) {
            throw toFileSystemProviderError(error);
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
            throw toFileSystemProviderError(error);
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
            
            // The withFileTypes: true option should return DirentData[]
            if (Array.isArray(entries)) {
                return entries.map(entry => [
                    entry.name,
                    entry.isFile ? FileType.File : FileType.Directory
                ]);
            }
            
            // Fallback to empty array if unexpected type
            return [];
        } catch (error) {
            throw toFileSystemProviderError(error);
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
            throw toFileSystemProviderError(error);
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
            throw toFileSystemProviderError(error);
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
            throw toFileSystemProviderError(error);
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
            throw toFileSystemProviderError(error);
        }
    }

    async writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
        if (!resource || !resource.path) {
            throw createFileSystemProviderError('Invalid resource URI', FileSystemProviderErrorCode.FileNotFound);
        }

        if (!content || !(content instanceof Uint8Array)) {
            throw createFileSystemProviderError('Invalid content: must be Uint8Array', FileSystemProviderErrorCode.Unknown);
        }

        await this.initialized;
        
        try {
            const path = resource.path.toString();
            
            // Validate target unless { create: true, overwrite: true }
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

            await this.fs.writeFile(path, content);
        } catch (error) {
            throw toFileSystemProviderError(error);
        }
    }

    private async handleFileSystemChange(event: MessageEvent): Promise<void> {
        if (!event.data?.path) {
            return;
        }

        const resource = new URI('file://' + event.data.path);
        let changeType: FileChangeType;
        
        if (event.data.type === 'created') {
            changeType = FileChangeType.ADDED;
        } 
        else if (event.data.type === 'deleted') {
            changeType = FileChangeType.DELETED;
        } 
        else {
            changeType = FileChangeType.UPDATED;
        }
        
        this.onDidChangeFileEmitter.fire([{ resource, type: changeType }]);
    }
}

function toFileSystemProviderError(error: any): FileSystemProviderError {
    if (error instanceof FileSystemProviderError) {
        return error; // avoid double conversion
    }

    let code: FileSystemProviderErrorCode;
    
    // Handle opfs-worker specific errors
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
