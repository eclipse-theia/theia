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
// based on https://github.com/microsoft/vscode/blob/04c36be045a94fee58e5f8992d3e3fd980294a84/src/vs/platform/files/common/files.ts

import URI from '@theia/core/lib/common/uri';
import { Event } from '@theia/core/lib/common/event';
import { Disposable as IDisposable } from '@theia/core/lib/common/disposable';
import { BinaryBuffer, BinaryBufferReadableStream } from '@theia/core/lib/common/buffer';
import type { TextDocumentContentChangeEvent } from 'vscode-languageserver-protocol';
import { ReadableStreamEvents } from '@theia/core/lib/common/stream';
import { CancellationToken } from '@theia/core/lib/common/cancellation';

export const enum FileOperation {
    CREATE,
    DELETE,
    MOVE,
    COPY
}

export class FileOperationEvent {

    constructor(resource: URI, operation: FileOperation.DELETE);
    constructor(resource: URI, operation: FileOperation.CREATE | FileOperation.MOVE | FileOperation.COPY, target: FileStatWithMetadata);
    constructor(public readonly resource: URI, public readonly operation: FileOperation, public readonly target?: FileStatWithMetadata) { }

    isOperation(operation: FileOperation.DELETE): boolean;
    isOperation(operation: FileOperation.MOVE | FileOperation.COPY | FileOperation.CREATE): this is { readonly target: FileStatWithMetadata };
    isOperation(operation: FileOperation): boolean {
        return this.operation === operation;
    }
}

/**
 * Possible changes that can occur to a file.
 */
export const enum FileChangeType {
    UPDATED = 0,
    ADDED = 1,
    DELETED = 2
}

/**
 * Identifies a single change in a file.
 */
export interface FileChange {

    /**
     * The type of change that occurred to the file.
     */
    readonly type: FileChangeType;

    /**
     * The unified resource identifier of the file that changed.
     */
    readonly resource: URI;
}

export class FileChangesEvent {

    constructor(public readonly changes: readonly FileChange[]) { }

    /**
     * Returns true if this change event contains the provided file with the given change type (if provided). In case of
     * type DELETED, this method will also return true if a folder got deleted that is the parent of the
     * provided file path.
     */
    contains(resource: URI, type?: FileChangeType): boolean {
        if (!resource) {
            return false;
        }

        const checkForChangeType = typeof type === 'number';

        return this.changes.some(change => {
            if (checkForChangeType && change.type !== type) {
                return false;
            }

            // For deleted also return true when deleted folder is parent of target path
            if (change.type === FileChangeType.DELETED) {
                return resource.isEqualOrParent(change.resource);
            }

            return resource.toString() === change.resource.toString();
        });
    }

    /**
     * Returns the changes that describe added files.
     */
    getAdded(): FileChange[] {
        return this.getOfType(FileChangeType.ADDED);
    }

    /**
     * Returns if this event contains added files.
     */
    gotAdded(): boolean {
        return this.hasType(FileChangeType.ADDED);
    }

    /**
     * Returns the changes that describe deleted files.
     */
    getDeleted(): FileChange[] {
        return this.getOfType(FileChangeType.DELETED);
    }

    /**
     * Returns if this event contains deleted files.
     */
    gotDeleted(): boolean {
        return this.hasType(FileChangeType.DELETED);
    }

    /**
     * Returns the changes that describe updated files.
     */
    getUpdated(): FileChange[] {
        return this.getOfType(FileChangeType.UPDATED);
    }

    /**
     * Returns if this event contains updated files.
     */
    gotUpdated(): boolean {
        return this.hasType(FileChangeType.UPDATED);
    }

    private getOfType(type: FileChangeType): FileChange[] {
        return this.changes.filter(change => change.type === type);
    }

    private hasType(type: FileChangeType): boolean {
        return this.changes.some(change => change.type === type);
    }
}

export interface BaseStat {

    /**
     * The unified resource identifier of this file or folder.
     */
    resource: URI;

    /**
     * The name which is the last segment
     * of the {{path}}.
     */
    name: string;

    /**
     * The size of the file.
     *
     * The value may or may not be resolved as
     * it is optional.
     */
    size?: number;

    /**
     * The last modification date represented as millis from unix epoch.
     *
     * The value may or may not be resolved as
     * it is optional.
     */
    mtime?: number;

    /**
     * The creation date represented as millis from unix epoch.
     *
     * The value may or may not be resolved as
     * it is optional.
     */
    ctime?: number;

    /**
     * A unique identifier that represents the
     * current state of the file or directory.
     *
     * The value may or may not be resolved as
     * it is optional.
     */
    etag?: string;
}
export namespace BaseStat {
    export function is(arg: Object | undefined): arg is BaseStat {
        return !!arg && typeof arg === 'object'
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            && ('resource' in arg && <any>arg['resource'] instanceof URI)
            && ('name' in arg && typeof arg['name'] === 'string');
    }
}

export interface BaseStatWithMetadata extends BaseStat {
    mtime: number;
    ctime: number;
    etag: string;
    size: number;
}

/**
 * A file resource with meta information.
 */
export interface FileStat extends BaseStat {

    /**
     * The resource is a file.
     */
    isFile: boolean;

    /**
     * The resource is a directory.
     */
    isDirectory: boolean;

    /**
     * The resource is a symbolic link.
     */
    isSymbolicLink: boolean;

    /**
     * The children of the file stat or undefined if none.
     */
    children?: FileStat[];
}
export namespace FileStat {
    export function is(arg: Object | undefined): arg is BaseStat {
        return BaseStat.is(arg) &&
            ('isFile' in arg && typeof arg['isFile'] === 'boolean') &&
            ('isDirectory' in arg && typeof arg['isDirectory'] === 'boolean') &&
            ('isSymbolicLink' in arg && typeof arg['isSymbolicLink'] === 'boolean');
    }
    export function asFileType(stat: FileStat): FileType {
        let res = 0;
        if (stat.isFile) {
            res += FileType.File;

        } else if (stat.isDirectory) {
            res += FileType.Directory;
        }
        if (stat.isSymbolicLink) {
            res += FileType.SymbolicLink;
        }
        return res;
    }
    export function toStat(stat: FileStat): Stat | { type: FileType } & Partial<Stat> {
        return {
            type: asFileType(stat),
            ctime: stat.ctime,
            mtime: stat.mtime,
            size: stat.size
        };
    }
    export function fromStat(resource: URI, stat: Stat): FileStatWithMetadata;
    export function fromStat(resource: URI, stat: { type: FileType } & Partial<Stat>): FileStat;
    export function fromStat(resource: URI, stat: Stat | { type: FileType } & Partial<Stat>): FileStat {
        return {
            resource,
            name: resource.path.base || resource.path.toString(),
            isFile: (stat.type & FileType.File) !== 0,
            isDirectory: (stat.type & FileType.Directory) !== 0,
            isSymbolicLink: (stat.type & FileType.SymbolicLink) !== 0,
            mtime: stat.mtime,
            ctime: stat.ctime,
            size: stat.size,
            etag: etag({ mtime: stat.mtime, size: stat.size })
        };
    }
    export function dir(resource: string | URI, stat?: Partial<Omit<Stat, 'type'>>): FileStat {
        return fromStat(resource instanceof URI ? resource : new URI(resource), { type: FileType.Directory, ...stat });
    }
    export function file(resource: string | URI, stat?: Partial<Omit<Stat, 'type'>>): FileStat {
        return fromStat(resource instanceof URI ? resource : new URI(resource), { type: FileType.File, ...stat });
    }
}

export interface FileStatWithMetadata extends FileStat, BaseStatWithMetadata {
    mtime: number;
    ctime: number;
    etag: string;
    size: number;
    children?: FileStatWithMetadata[];
}

export interface ResolveFileResult {
    stat?: FileStat;
    success: boolean;
}

export interface ResolveFileResultWithMetadata extends ResolveFileResult {
    stat?: FileStatWithMetadata;
}

export interface FileContent extends BaseStatWithMetadata {

    /**
     * The content of a file as buffer.
     */
    value: BinaryBuffer;
}

export interface FileStreamContent extends BaseStatWithMetadata {

    /**
     * The content of a file as stream.
     */
    value: BinaryBufferReadableStream;
}

export interface WriteFileOptions {

    /**
     * The last known modification time of the file. This can be used to prevent dirty writes.
     */
    readonly mtime?: number;

    /**
     * The etag of the file. This can be used to prevent dirty writes.
     */
    readonly etag?: string;
}

export interface ReadFileOptions extends FileReadStreamOptions {

    /**
     * The optional etag parameter allows to return early from resolving the resource if
     * the contents on disk match the etag. This prevents accumulated reading of resources
     * that have been read already with the same etag.
     * It is the task of the caller to makes sure to handle this error case from the promise.
     */
    readonly etag?: string;
}

export interface WriteFileOptions {

    /**
     * The last known modification time of the file. This can be used to prevent dirty writes.
     */
    readonly mtime?: number;

    /**
     * The etag of the file. This can be used to prevent dirty writes.
     */
    readonly etag?: string;
}

export interface ResolveFileOptions {

    /**
     * Automatically continue resolving children of a directory until the provided resources
     * are found.
     */
    readonly resolveTo?: readonly URI[];

    /**
     * Automatically continue resolving children of a directory if the number of children is 1.
     */
    readonly resolveSingleChildDescendants?: boolean;

    /**
     * Will resolve mtime, ctime, size and etag of files if enabled. This can have a negative impact
     * on performance and thus should only be used when these values are required.
     */
    readonly resolveMetadata?: boolean;
}

export interface ResolveMetadataFileOptions extends ResolveFileOptions {
    readonly resolveMetadata: true;
}

export interface FileOperationOptions {
    /**
     * Indicates that a user action triggered the opening, e.g.
     * via mouse or keyboard use. Default is true.
     */
    fromUserGesture?: boolean
}

export interface MoveFileOptions extends FileOperationOptions, Partial<FileOverwriteOptions> {
}

export interface CopyFileOptions extends FileOperationOptions, Partial<FileOverwriteOptions> {
}

export interface CreateFileOptions extends FileOperationOptions, Partial<FileOverwriteOptions> {
}

export class FileOperationError extends Error {
    constructor(message: string, public fileOperationResult: FileOperationResult, public options?: ReadFileOptions & WriteFileOptions & CreateFileOptions) {
        super(message);
        Object.setPrototypeOf(this, FileOperationError.prototype);
    }
}

export const enum FileOperationResult {
    FILE_IS_DIRECTORY,
    FILE_NOT_FOUND,
    FILE_NOT_MODIFIED_SINCE,
    FILE_MODIFIED_SINCE,
    FILE_MOVE_CONFLICT,
    FILE_READ_ONLY,
    FILE_PERMISSION_DENIED,
    FILE_TOO_LARGE,
    FILE_INVALID_PATH,
    FILE_EXCEEDS_MEMORY_LIMIT,
    FILE_NOT_DIRECTORY,
    FILE_OTHER_ERROR
}

export interface FileOverwriteOptions {
    /**
     * Overwrite the file to create if it already exists on disk. Otherwise
     * an error will be thrown (FILE_MODIFIED_SINCE).
     */
    overwrite: boolean;
}

export interface FileReadStreamOptions {

    /**
     * Is an integer specifying where to begin reading from in the file. If position is undefined,
     * data will be read from the current file position.
     */
    readonly position?: number;

    /**
     * Is an integer specifying how many bytes to read from the file. By default, all bytes
     * will be read.
     */
    readonly length?: number;

    /**
     * If provided, the size of the file will be checked against the limits.
     */
    limits?: {
        readonly size?: number;
        readonly memory?: number;
    };
}

export interface FileUpdateOptions {
    readEncoding: string;
    writeEncoding: string;
    overwriteEncoding: boolean;
}
export interface FileUpdateResult extends Stat {
    encoding: string;
}

export interface FileWriteOptions {
    overwrite: boolean;
    create: boolean;
}

export interface FileOpenOptions {
    create: boolean;
}

export interface FileDeleteOptions {
    recursive: boolean;
    useTrash: boolean;
}

export enum FileType {
    Unknown = 0,
    File = 1,
    Directory = 2,
    SymbolicLink = 64
}

export interface Stat {
    type: FileType;

    /**
     * The last modification date represented as millis from unix epoch.
     */
    mtime: number;

    /**
     * The creation date represented as millis from unix epoch.
     */
    ctime: number;

    size: number;
}

export interface WatchOptions {
    recursive: boolean;
    excludes: string[];
}

export const enum FileSystemProviderCapabilities {
    FileReadWrite = 1 << 1,
    FileOpenReadWriteClose = 1 << 2,
    FileReadStream = 1 << 4,

    FileFolderCopy = 1 << 3,

    PathCaseSensitive = 1 << 10,
    Readonly = 1 << 11,

    Trash = 1 << 12,

    Access = 1 << 24,
    Update = 1 << 25
}

export enum FileSystemProviderErrorCode {
    FileExists = 'EntryExists',
    FileNotFound = 'EntryNotFound',
    FileNotADirectory = 'EntryNotADirectory',
    FileIsADirectory = 'EntryIsADirectory',
    FileExceedsMemoryLimit = 'EntryExceedsMemoryLimit',
    FileTooLarge = 'EntryTooLarge',
    NoPermissions = 'NoPermissions',
    Unavailable = 'Unavailable',
    Unknown = 'Unknown'
}

export class FileSystemProviderError extends Error {

    constructor(message: string, public readonly code: FileSystemProviderErrorCode) {
        super(message);
        Object.setPrototypeOf(this, FileSystemProviderError.prototype);
    }
}

export function createFileSystemProviderError(error: Error | string, code: FileSystemProviderErrorCode): FileSystemProviderError {
    const providerError = new FileSystemProviderError(error.toString(), code);
    markAsFileSystemProviderError(providerError, code);

    return providerError;
}

export function ensureFileSystemProviderError(error?: Error): Error {
    if (!error) {
        return createFileSystemProviderError('Unknown Error', FileSystemProviderErrorCode.Unknown); // https://github.com/Microsoft/vscode/issues/72798
    }

    return error;
}

export const FileSystemProvider = Symbol('FileSystemProvider');
export interface FileSystemProvider {

    readonly capabilities: FileSystemProviderCapabilities;
    readonly onDidChangeCapabilities: Event<void>;

    readonly onDidChangeFile: Event<readonly FileChange[]>;
    readonly onFileWatchError: Event<void>;
    watch(resource: URI, opts: WatchOptions): IDisposable;

    stat(resource: URI): Promise<Stat>;
    mkdir(resource: URI): Promise<void>;
    readdir(resource: URI): Promise<[string, FileType][]>;
    delete(resource: URI, opts: FileDeleteOptions): Promise<void>;

    rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void>;
    copy?(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void>;

    readFile?(resource: URI): Promise<Uint8Array>;
    writeFile?(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void>;

    readFileStream?(resource: URI, opts: FileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array>;

    open?(resource: URI, opts: FileOpenOptions): Promise<number>;
    close?(fd: number): Promise<void>;
    read?(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number>;
    write?(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number>;

    access?(resource: URI, mode?: number): Promise<void>;
    fsPath?(resource: URI): Promise<string>;

    updateFile?(resource: URI, changes: TextDocumentContentChangeEvent[], opts: FileUpdateOptions): Promise<FileUpdateResult>;
}

export interface FileSystemProviderWithAccessCapability extends FileSystemProvider {
    access(resource: URI, mode?: number): Promise<void>;
    fsPath(resource: URI): Promise<string>;
}

export function hasAccessCapability(provider: FileSystemProvider): provider is FileSystemProviderWithAccessCapability {
    return !!(provider.capabilities & FileSystemProviderCapabilities.Access);
}

export interface FileSystemProviderWithUpdateCapability extends FileSystemProvider {
    updateFile(resource: URI, changes: TextDocumentContentChangeEvent[], opts: FileUpdateOptions): Promise<FileUpdateResult>;
}

export function hasUpdateCapability(provider: FileSystemProvider): provider is FileSystemProviderWithUpdateCapability {
    return !!(provider.capabilities & FileSystemProviderCapabilities.Update);
}

export interface FileSystemProviderWithFileReadWriteCapability extends FileSystemProvider {
    readFile(resource: URI): Promise<Uint8Array>;
    writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void>;
}

export function hasReadWriteCapability(provider: FileSystemProvider): provider is FileSystemProviderWithFileReadWriteCapability {
    return !!(provider.capabilities & FileSystemProviderCapabilities.FileReadWrite);
}

export interface FileSystemProviderWithFileFolderCopyCapability extends FileSystemProvider {
    copy(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void>;
}

export function hasFileFolderCopyCapability(provider: FileSystemProvider): provider is FileSystemProviderWithFileFolderCopyCapability {
    return !!(provider.capabilities & FileSystemProviderCapabilities.FileFolderCopy);
}

export interface FileSystemProviderWithOpenReadWriteCloseCapability extends FileSystemProvider {
    open(resource: URI, opts: FileOpenOptions): Promise<number>;
    close(fd: number): Promise<void>;
    read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number>;
    write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number>;
}

export function hasOpenReadWriteCloseCapability(provider: FileSystemProvider): provider is FileSystemProviderWithOpenReadWriteCloseCapability {
    return !!(provider.capabilities & FileSystemProviderCapabilities.FileOpenReadWriteClose);
}

export interface FileSystemProviderWithFileReadStreamCapability extends FileSystemProvider {
    readFileStream(resource: URI, opts: FileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array>;
}

export function hasFileReadStreamCapability(provider: FileSystemProvider): provider is FileSystemProviderWithFileReadStreamCapability {
    return !!(provider.capabilities & FileSystemProviderCapabilities.FileReadStream);
}

export function markAsFileSystemProviderError(error: Error, code: FileSystemProviderErrorCode): Error {
    error.name = code ? `${code} (FileSystemError)` : 'FileSystemError';

    return error;
}

export function toFileSystemProviderErrorCode(error: Error | undefined | null): FileSystemProviderErrorCode {

    // Guard against abuse
    if (!error) {
        return FileSystemProviderErrorCode.Unknown;
    }

    // FileSystemProviderError comes with the code
    if (error instanceof FileSystemProviderError) {
        return error.code;
    }

    // Any other error, check for name match by assuming that the error
    // went through the markAsFileSystemProviderError() method
    const match = /^(.+) \(FileSystemError\)$/.exec(error.name);
    if (!match) {
        return FileSystemProviderErrorCode.Unknown;
    }

    switch (match[1]) {
        case FileSystemProviderErrorCode.FileExists: return FileSystemProviderErrorCode.FileExists;
        case FileSystemProviderErrorCode.FileIsADirectory: return FileSystemProviderErrorCode.FileIsADirectory;
        case FileSystemProviderErrorCode.FileNotADirectory: return FileSystemProviderErrorCode.FileNotADirectory;
        case FileSystemProviderErrorCode.FileNotFound: return FileSystemProviderErrorCode.FileNotFound;
        case FileSystemProviderErrorCode.FileExceedsMemoryLimit: return FileSystemProviderErrorCode.FileExceedsMemoryLimit;
        case FileSystemProviderErrorCode.FileTooLarge: return FileSystemProviderErrorCode.FileTooLarge;
        case FileSystemProviderErrorCode.NoPermissions: return FileSystemProviderErrorCode.NoPermissions;
        case FileSystemProviderErrorCode.Unavailable: return FileSystemProviderErrorCode.Unavailable;
    }

    return FileSystemProviderErrorCode.Unknown;
}

export function toFileOperationResult(error: Error): FileOperationResult {

    // FileSystemProviderError comes with the result already
    if (error instanceof FileOperationError) {
        return error.fileOperationResult;
    }

    // Otherwise try to find from code
    switch (toFileSystemProviderErrorCode(error)) {
        case FileSystemProviderErrorCode.FileNotFound:
            return FileOperationResult.FILE_NOT_FOUND;
        case FileSystemProviderErrorCode.FileIsADirectory:
            return FileOperationResult.FILE_IS_DIRECTORY;
        case FileSystemProviderErrorCode.FileNotADirectory:
            return FileOperationResult.FILE_NOT_DIRECTORY;
        case FileSystemProviderErrorCode.NoPermissions:
            return FileOperationResult.FILE_PERMISSION_DENIED;
        case FileSystemProviderErrorCode.FileExists:
            return FileOperationResult.FILE_MOVE_CONFLICT;
        case FileSystemProviderErrorCode.FileExceedsMemoryLimit:
            return FileOperationResult.FILE_EXCEEDS_MEMORY_LIMIT;
        case FileSystemProviderErrorCode.FileTooLarge:
            return FileOperationResult.FILE_TOO_LARGE;
        default:
            return FileOperationResult.FILE_OTHER_ERROR;
    }
}

/**
 * A hint to disable etag checking for reading/writing.
 */
export const ETAG_DISABLED = '';

export function etag(stat: { mtime: number, size: number }): string;
export function etag(stat: { mtime: number | undefined, size: number | undefined }): string | undefined;
export function etag(stat: { mtime: number | undefined, size: number | undefined }): string | undefined {
    if (typeof stat.size !== 'number' || typeof stat.mtime !== 'number') {
        return undefined;
    }

    return stat.mtime.toString(29) + stat.size.toString(31);
}
/**
 * Helper to format a raw byte size into a human readable label.
 */
export class BinarySize {
    static readonly KB = 1024;
    static readonly MB = BinarySize.KB * BinarySize.KB;
    static readonly GB = BinarySize.MB * BinarySize.KB;
    static readonly TB = BinarySize.GB * BinarySize.KB;

    static formatSize(size: number): string {
        if (size < BinarySize.KB) {
            return size + 'B';
        }
        if (size < BinarySize.MB) {
            return (size / BinarySize.KB).toFixed(2) + 'KB';
        }
        if (size < BinarySize.GB) {
            return (size / BinarySize.MB).toFixed(2) + 'MB';
        }
        if (size < BinarySize.TB) {
            return (size / BinarySize.GB).toFixed(2) + 'GB';
        }
        return (size / BinarySize.TB).toFixed(2) + 'TB';
    }
}
