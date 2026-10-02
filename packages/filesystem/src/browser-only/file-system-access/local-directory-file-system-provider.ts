// *****************************************************************************
// Copyright (C) 2026 Robert Jandow
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { Disposable, DisposableCollection, Emitter, Event, Path, URI } from '@theia/core';
import { EncodingService } from '@theia/core/lib/common/encoding-service';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { TextDocumentContentChangeEvent } from '@theia/core/shared/vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    FileChange, FileChangeType, FileDeleteOptions, FileOpenOptions, FileOverwriteOptions,
    FileSystemProviderCapabilities, FileSystemProviderError, FileSystemProviderErrorCode,
    FileSystemProviderWithFileFolderCopyCapability, FileSystemProviderWithFileReadWriteCapability,
    FileSystemProviderWithOpenReadWriteCloseCapability, FileType, FileUpdateOptions, FileUpdateResult,
    FileWriteOptions, Stat, WatchOptions, createFileSystemProviderError
} from '../../common/files';
import { FileSystemAccessHandle, FileSystemObserverConstructor, FileSystemObserverRecord, WindowWithFileSystemAccess } from './file-system-access-types';

export const LocalDirectoryFileSystemProviderOptions = Symbol('LocalDirectoryFileSystemProviderOptions');
export interface LocalDirectoryFileSystemProviderOptions {
    /** The handle of the directory that is served as the root of this provider. */
    handle: FileSystemDirectoryHandle;
}

export const LocalDirectoryFileSystemProviderFactory = Symbol('LocalDirectoryFileSystemProviderFactory');
export type LocalDirectoryFileSystemProviderFactory = (options: LocalDirectoryFileSystemProviderOptions) => LocalDirectoryFileSystemProvider;

interface OpenFile {
    uri: URI;
    handle: FileSystemFileHandle;
    /** Grows geometrically, only the first `size` bytes are content. */
    data: Uint8Array;
    size: number;
    dirty: boolean;
}

const OBSERVER_CHANGE_TYPES: Partial<Record<FileSystemObserverRecord['type'], FileChangeType>> = {
    appeared: FileChangeType.ADDED,
    disappeared: FileChangeType.DELETED,
    modified: FileChangeType.UPDATED
};

/**
 * Serves a local directory that was picked through the File System Access API.
 *
 * The provider is relative to the mount: it expects URIs of the form `file:///<path inside the directory>`
 * and emits change events with the same kind of URIs.
 */
@injectable()
export class LocalDirectoryFileSystemProvider implements Disposable,
    FileSystemProviderWithFileReadWriteCapability,
    FileSystemProviderWithOpenReadWriteCloseCapability,
    FileSystemProviderWithFileFolderCopyCapability {

    capabilities: FileSystemProviderCapabilities =
        FileSystemProviderCapabilities.FileReadWrite |
        FileSystemProviderCapabilities.FileOpenReadWriteClose |
        FileSystemProviderCapabilities.FileFolderCopy |
        FileSystemProviderCapabilities.Update;

    readonly onDidChangeCapabilities: Event<void> = Event.None;
    readonly onFileWatchError: Event<void> = Event.None;

    protected readonly onDidChangeFileEmitter = new Emitter<readonly FileChange[]>();
    readonly onDidChangeFile: Event<readonly FileChange[]> = this.onDidChangeFileEmitter.event;

    @inject(LocalDirectoryFileSystemProviderOptions)
    protected readonly options: LocalDirectoryFileSystemProviderOptions;

    @inject(EncodingService)
    protected readonly encodingService: EncodingService;

    protected readonly openFiles = new Map<number, OpenFile>();
    protected nextFd = 1;

    protected readonly toDispose = new DisposableCollection(this.onDidChangeFileEmitter);

    // #region watching

    watch(resource: URI, opts: WatchOptions): Disposable {
        // Without the FileSystemObserver (Chromium only) there is no way to learn about changes that are made outside of Theia.
        // Changes made through this provider are always reported by the mutating methods themselves.
        const observerConstructor = this.getObserverConstructor();
        if (!observerConstructor) {
            return Disposable.NULL;
        }
        const watched = this.getSegments(resource);
        let disposed = false;
        const observer = new observerConstructor(records => {
            if (!disposed) {
                this.handleObserverRecords(watched, records);
            }
        });
        this.resolveHandle(watched)
            .then(handle => disposed ? undefined : observer.observe(handle, { recursive: opts.recursive }))
            .catch(() => {
                // The watched resource may be gone or not observable, there is nothing useful to do about that.
            });
        // `push` returns a disposable that also removes the watcher from the collection again.
        return this.toDispose.push(Disposable.create(() => {
            disposed = true;
            observer.disconnect();
        }));
    }

    protected getObserverConstructor(): FileSystemObserverConstructor | undefined {
        return typeof window === 'undefined' ? undefined : (window as unknown as WindowWithFileSystemAccess).FileSystemObserver;
    }

    protected handleObserverRecords(watched: string[], records: FileSystemObserverRecord[]): void {
        const changes: FileChange[] = [];
        for (const record of records) {
            const path = [...watched, ...record.relativePathComponents];
            const type = OBSERVER_CHANGE_TYPES[record.type];
            if (type !== undefined) {
                changes.push({ resource: this.toUri(path), type });
            } else if (record.type === 'moved') {
                if (record.relativePathMovedFrom) {
                    changes.push({ resource: this.toUri([...watched, ...record.relativePathMovedFrom]), type: FileChangeType.DELETED });
                }
                changes.push({ resource: this.toUri(path), type: FileChangeType.ADDED });
            } else {
                changes.push({ resource: this.toUri(watched), type: FileChangeType.UPDATED });
            }
        }
        this.fireChanges(changes);
    }

    // #endregion

    // #region metadata

    async stat(resource: URI): Promise<Stat> {
        try {
            const handle = await this.resolveHandle(this.getSegments(resource));
            if (handle.kind === 'directory') {
                return { type: FileType.Directory, mtime: 0, ctime: 0, size: 0 };
            }
            const file = await (handle as FileSystemFileHandle).getFile();
            return { type: FileType.File, mtime: file.lastModified, ctime: file.lastModified, size: file.size };
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }

    async mkdir(resource: URI): Promise<void> {
        try {
            const segments = this.getSegments(resource);
            let current = this.options.handle;
            const created: FileChange[] = [];
            for (let i = 0; i < segments.length; i++) {
                let next: FileSystemDirectoryHandle;
                try {
                    next = await current.getDirectoryHandle(segments[i]);
                } catch (error) {
                    if (this.isError(error, 'TypeMismatchError')) {
                        throw createFileSystemProviderError(`A file exists at ${this.toUri(segments.slice(0, i + 1))}`, FileSystemProviderErrorCode.FileExists);
                    }
                    if (!this.isError(error, 'NotFoundError')) {
                        throw error;
                    }
                    next = await current.getDirectoryHandle(segments[i], { create: true });
                    created.push({ resource: this.toUri(segments.slice(0, i + 1)), type: FileChangeType.ADDED });
                }
                current = next;
            }
            this.fireChanges(created);
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }

    async readdir(resource: URI): Promise<[string, FileType][]> {
        try {
            const directory = await this.getDirectory(this.getSegments(resource));
            const result: [string, FileType][] = [];
            for await (const [name, handle] of directory.entries()) {
                result.push([name, handle.kind === 'directory' ? FileType.Directory : FileType.File]);
            }
            return result;
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }

    async delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
        try {
            const segments = this.getSegments(resource);
            if (segments.length === 0) {
                throw createFileSystemProviderError('The root of a local folder cannot be deleted', FileSystemProviderErrorCode.NoPermissions);
            }
            const parent = await this.getDirectory(segments.slice(0, -1));
            await parent.removeEntry(segments[segments.length - 1], { recursive: opts.recursive });
            this.fireChanges([{ resource, type: FileChangeType.DELETED }]);
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }

    async rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        try {
            const fromSegments = this.getSegments(from);
            const toSegments = this.getSegments(to);
            if (fromSegments.length === 0 || toSegments.length === 0) {
                throw createFileSystemProviderError('The root of a local folder cannot be renamed', FileSystemProviderErrorCode.NoPermissions);
            }
            const source = await this.resolveHandle(fromSegments);
            if (this.isSamePath(fromSegments, toSegments)) {
                return;
            }
            this.assertNotInside(fromSegments, toSegments);
            const targetParent = await this.getDirectory(toSegments.slice(0, -1));
            const targetName = toSegments[toSegments.length - 1];
            const targetIsSource = await this.prepareTarget(targetParent, targetName, opts, source);

            const move = (source as FileSystemAccessHandle).move;
            let moved = false;
            if (typeof move === 'function') {
                try {
                    await move.call(source, targetParent, targetName);
                    moved = true;
                } catch (error) {
                    // Chromium does not support moving everything, e.g. directories, so fall back to copy and delete.
                    if (this.isError(error, 'NotAllowedError') || this.isError(error, 'SecurityError')) {
                        throw error;
                    }
                }
            }
            if (!moved) {
                if (targetIsSource) {
                    // Copying onto the source and deleting the source afterwards would lose the entry.
                    throw createFileSystemProviderError(`Cannot rename ${from} to ${to}, they refer to the same entry`, FileSystemProviderErrorCode.Unavailable);
                }
                await this.copyHandle(source, targetParent, targetName);
                const sourceParent = await this.getDirectory(fromSegments.slice(0, -1));
                await sourceParent.removeEntry(fromSegments[fromSegments.length - 1], { recursive: true });
            }
            this.fireChanges([
                { resource: from, type: FileChangeType.DELETED },
                { resource: to, type: FileChangeType.ADDED }
            ]);
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }

    async copy(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        try {
            const fromSegments = this.getSegments(from);
            const toSegments = this.getSegments(to);
            if (toSegments.length === 0) {
                throw createFileSystemProviderError('Cannot overwrite the root of a local folder', FileSystemProviderErrorCode.NoPermissions);
            }
            const source = await this.resolveHandle(fromSegments);
            if (this.isSamePath(fromSegments, toSegments)) {
                return;
            }
            this.assertNotInside(fromSegments, toSegments);
            const targetParent = await this.getDirectory(toSegments.slice(0, -1));
            const targetName = toSegments[toSegments.length - 1];
            if (await this.prepareTarget(targetParent, targetName, opts, source)) {
                return;
            }
            await this.copyHandle(source, targetParent, targetName);
            this.fireChanges([{ resource: to, type: FileChangeType.ADDED }]);
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }

    // #endregion

    // #region file read / write

    async readFile(resource: URI): Promise<Uint8Array> {
        try {
            const file = await this.getFileHandle(await this.getParentDirectory(resource), this.getName(resource));
            return new Uint8Array(await (await file.getFile()).arrayBuffer());
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }

    async writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
        try {
            const parent = await this.getParentDirectory(resource);
            const name = this.getName(resource);
            const existing = await this.findFile(parent, name);
            if (existing && !opts.overwrite) {
                throw createFileSystemProviderError(`File already exists: ${resource}`, FileSystemProviderErrorCode.FileExists);
            }
            if (!existing && !opts.create) {
                throw createFileSystemProviderError(`File does not exist: ${resource}`, FileSystemProviderErrorCode.FileNotFound);
            }
            const handle = existing ?? await parent.getFileHandle(name, { create: true });
            await this.writeHandle(handle, content);
            this.fireChanges([{ resource, type: existing ? FileChangeType.UPDATED : FileChangeType.ADDED }]);
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }

    // #endregion

    // #region open / read / write / close

    // The File System Access API has no file descriptors, so an open file is buffered in memory and flushed on close.
    async open(resource: URI, opts: FileOpenOptions): Promise<number> {
        try {
            const parent = await this.getParentDirectory(resource);
            const name = this.getName(resource);
            const existing = await this.findFile(parent, name);
            if (!existing && !opts.create) {
                throw createFileSystemProviderError(`File does not exist: ${resource}`, FileSystemProviderErrorCode.FileNotFound);
            }
            let handle: FileSystemFileHandle;
            let data: Uint8Array;
            let dirty = false;
            if (opts.create) {
                // Same as OPFS: opening with `create` truncates.
                if (existing) {
                    handle = existing;
                } else {
                    handle = await parent.getFileHandle(name, { create: true });
                    this.fireChanges([{ resource, type: FileChangeType.ADDED }]);
                }
                data = new Uint8Array(0);
                dirty = !!existing;
            } else {
                handle = existing!;
                data = new Uint8Array(await (await handle.getFile()).arrayBuffer());
            }
            const fd = this.nextFd++;
            this.openFiles.set(fd, { uri: resource, handle, data, size: data.byteLength, dirty });
            return fd;
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }

    async close(fd: number): Promise<void> {
        const file = this.openFiles.get(fd);
        if (!file) {
            return;
        }
        this.openFiles.delete(fd);
        if (!file.dirty) {
            return;
        }
        try {
            await this.writeHandle(file.handle, file.data.subarray(0, file.size));
            this.fireChanges([{ resource: file.uri, type: FileChangeType.UPDATED }]);
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }

    async read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
        const file = this.getOpenFile(fd);
        const bytesRead = Math.max(0, Math.min(length, file.size - pos));
        data.set(file.data.subarray(pos, pos + bytesRead), offset);
        return bytesRead;
    }

    async write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
        const file = this.getOpenFile(fd);
        const end = pos + length;
        if (end > file.data.byteLength) {
            // FileService writes in small chunks, growing to the exact size would copy the whole file on every chunk.
            const grown = new Uint8Array(Math.max(end, file.data.byteLength * 2));
            grown.set(file.data.subarray(0, file.size));
            file.data = grown;
        }
        file.data.set(data.subarray(offset, offset + length), pos);
        file.size = Math.max(file.size, end);
        file.dirty = true;
        return length;
    }

    protected getOpenFile(fd: number): OpenFile {
        const file = this.openFiles.get(fd);
        if (!file) {
            throw createFileSystemProviderError(`Unknown file descriptor ${fd}`, FileSystemProviderErrorCode.Unknown);
        }
        return file;
    }

    // #endregion

    async updateFile(resource: URI, changes: TextDocumentContentChangeEvent[], opts: FileUpdateOptions): Promise<FileUpdateResult> {
        try {
            // Resolve the handle once rather than walking the path again for the read, the write and the stat.
            const handle = await this.getFileHandle(await this.getParentDirectory(resource), this.getName(resource));
            const content = new Uint8Array(await (await handle.getFile()).arrayBuffer());
            const decoded = this.encodingService.decode(BinaryBuffer.wrap(content), opts.readEncoding);
            const newContent = TextDocument.update(TextDocument.create('', '', 1, decoded), changes, 2).getText();
            const encoding = await this.encodingService.toResourceEncoding(opts.writeEncoding, {
                overwriteEncoding: opts.overwriteEncoding,
                read: async length => content.subarray(0, length)
            });
            const encoded = this.encodingService.encode(newContent, encoding);

            await this.writeHandle(handle, encoded.buffer);
            this.fireChanges([{ resource, type: FileChangeType.UPDATED }]);

            const file = await handle.getFile();
            return { type: FileType.File, mtime: file.lastModified, ctime: file.lastModified, size: file.size, encoding: encoding.encoding };
        } catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }

    dispose(): void {
        this.openFiles.clear();
        this.toDispose.dispose();
    }

    // #region helpers

    protected fireChanges(changes: FileChange[]): void {
        if (changes.length > 0) {
            this.onDidChangeFileEmitter.fire(changes);
        }
    }

    protected getSegments(resource: URI): string[] {
        // The root and repeated or trailing slashes show up as empty names.
        return resource.allLocations.map(location => location.path.base).filter(name => name.length > 0).reverse();
    }

    protected toUri(segments: string[]): URI {
        return new URI('file:///').withPath(new Path(Path.separator).join(...segments));
    }

    protected getName(resource: URI): string {
        const segments = this.getSegments(resource);
        if (segments.length === 0) {
            throw createFileSystemProviderError('The root of a local folder is not a file', FileSystemProviderErrorCode.FileIsADirectory);
        }
        return segments[segments.length - 1];
    }

    protected getParentDirectory(resource: URI): Promise<FileSystemDirectoryHandle> {
        return this.getDirectory(this.getSegments(resource).slice(0, -1));
    }

    protected isSamePath(a: string[], b: string[]): boolean {
        return a.length === b.length && a.every((segment, index) => segment === b[index]);
    }

    protected assertNotInside(source: string[], target: string[]): void {
        if (target.length > source.length && source.every((segment, index) => segment === target[index])) {
            throw createFileSystemProviderError('Cannot move or copy a folder into itself', FileSystemProviderErrorCode.Unknown);
        }
    }

    protected async getDirectory(segments: string[]): Promise<FileSystemDirectoryHandle> {
        let current = this.options.handle;
        for (const segment of segments) {
            current = await this.getDirectoryHandle(current, segment);
        }
        return current;
    }

    protected async getDirectoryHandle(parent: FileSystemDirectoryHandle, name: string): Promise<FileSystemDirectoryHandle> {
        try {
            return await parent.getDirectoryHandle(name);
        } catch (error) {
            if (this.isError(error, 'TypeMismatchError')) {
                throw createFileSystemProviderError(`Not a directory: ${name}`, FileSystemProviderErrorCode.FileNotADirectory);
            }
            throw error;
        }
    }

    protected async getFileHandle(parent: FileSystemDirectoryHandle, name: string): Promise<FileSystemFileHandle> {
        try {
            return await parent.getFileHandle(name);
        } catch (error) {
            if (this.isError(error, 'TypeMismatchError')) {
                throw createFileSystemProviderError(`Is a directory: ${name}`, FileSystemProviderErrorCode.FileIsADirectory);
            }
            throw error;
        }
    }

    /** Returns the file handle, or `undefined` if there is no entry with that name. Throws if the entry is a directory. */
    protected async findFile(parent: FileSystemDirectoryHandle, name: string): Promise<FileSystemFileHandle | undefined> {
        try {
            return await this.getFileHandle(parent, name);
        } catch (error) {
            if (this.isError(error, 'NotFoundError')) {
                return undefined;
            }
            throw error;
        }
    }

    protected async resolveHandle(segments: string[]): Promise<FileSystemHandle> {
        if (segments.length === 0) {
            return this.options.handle;
        }
        const parent = await this.getDirectory(segments.slice(0, -1));
        const name = segments[segments.length - 1];
        try {
            return await parent.getFileHandle(name);
        } catch (error) {
            if (this.isError(error, 'TypeMismatchError')) {
                return parent.getDirectoryHandle(name);
            }
            throw error;
        }
    }

    protected async writeHandle(handle: FileSystemFileHandle, content: Uint8Array): Promise<void> {
        const writable = await handle.createWritable();
        try {
            await writable.write(content as Uint8Array<ArrayBuffer>);
        } catch (error) {
            await writable.abort?.().catch(() => undefined);
            throw error;
        }
        await writable.close();
    }

    /**
     * Makes room for a rename or copy target, honouring the `overwrite` option.
     * @returns `true` if the target resolves to the source itself, in which case nothing was removed.
     */
    protected async prepareTarget(parent: FileSystemDirectoryHandle, name: string, opts: FileOverwriteOptions, source: FileSystemHandle): Promise<boolean> {
        let existing: FileSystemHandle;
        try {
            existing = await parent.getFileHandle(name);
        } catch (error) {
            if (this.isError(error, 'NotFoundError')) {
                return false;
            }
            // A TypeMismatchError means a directory with that name exists.
            if (!this.isError(error, 'TypeMismatchError')) {
                throw error;
            }
            existing = await parent.getDirectoryHandle(name);
        }
        // On a case-insensitive host file system a case-only rename (`a.txt` -> `A.txt`) finds the source
        // under the target name. Removing it as an "existing target" would delete the source.
        if (await existing.isSameEntry(source)) {
            return true;
        }
        if (!opts.overwrite) {
            throw createFileSystemProviderError(`Target already exists: ${name}`, FileSystemProviderErrorCode.FileExists);
        }
        await parent.removeEntry(name, { recursive: true });
        return false;
    }

    protected async copyHandle(source: FileSystemHandle, targetParent: FileSystemDirectoryHandle, name: string): Promise<void> {
        if (source.kind === 'file') {
            const file = await (source as FileSystemFileHandle).getFile();
            const target = await targetParent.getFileHandle(name, { create: true });
            await this.writeHandle(target, new Uint8Array(await file.arrayBuffer()));
            return;
        }
        const targetDirectory = await targetParent.getDirectoryHandle(name, { create: true });
        for await (const [childName, child] of (source as FileSystemDirectoryHandle).entries()) {
            await this.copyHandle(child, targetDirectory, childName);
        }
    }

    protected isError(error: unknown, name: string): boolean {
        return error instanceof Object && (error as { name?: unknown }).name === name;
    }

    protected toFileSystemProviderError(error: unknown): FileSystemProviderError {
        if (error instanceof FileSystemProviderError) {
            return error;
        }
        const message = error instanceof Error ? error.message : String(error);
        let code: FileSystemProviderErrorCode;
        if (this.isError(error, 'NotFoundError')) {
            code = FileSystemProviderErrorCode.FileNotFound;
        } else if (this.isError(error, 'TypeMismatchError')) {
            code = FileSystemProviderErrorCode.FileNotADirectory;
        } else if (this.isError(error, 'NotAllowedError') || this.isError(error, 'SecurityError')) {
            code = FileSystemProviderErrorCode.NoPermissions;
        } else {
            // Includes InvalidModificationError (e.g. removing a non-empty directory non-recursively) and
            // QuotaExceededError, which have no better fitting code.
            code = FileSystemProviderErrorCode.Unknown;
        }
        return createFileSystemProviderError(message, code);
    }

    // #endregion
}
