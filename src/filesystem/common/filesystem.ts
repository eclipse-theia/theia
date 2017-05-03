/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Disposable } from '../../application/common';

export const FileSystem = Symbol("FileSystem");

export interface FileSystem extends Disposable {

    /**
     * Returns the filestat for the given URI.
     *
     * If the URI points to a folder it will contain one level of unresolved children.
     */
    getFileStat(uri: string): Promise<FileStat>;

    /**
     * Finds out if the file identified by the resource URI exists.
     */
    exists(uri: string): Promise<boolean>;

    /**
     * Resolves the content of the file identified by the URI.
     */
    resolveContent(uri: string, options?: { encoding?: string }): Promise<{ stat: FileStat, content: string }>;

    /**
     * Updates the content by replacing its previous value with the new one.
     */
    setContent(file: FileStat, content: string, options?: { encoding?: string }): Promise<FileStat>;

    /**
     * Moves the file to a new path identified by the target file URI.
     *
     * The optional parameter `overwrite` can be set to replace an existing file at the given location.
     */
    move(sourceStat: FileStat, targetUri: string, options?: { overwrite?: boolean }): Promise<FileStat>;

    /**
     * Copies the file identified by the filestat to the desired target location.
     *
     * The optional parameter overwrite can be set to replace an existing file at the location.
     */
    copy(sourceStat: FileStat, targetUri: string, options?: { overwrite?: boolean, recursive?: boolean }): Promise<FileStat>;

    /**
     * Creates a new file with the given path. The returned promise
     * will have the stat model object as a result.
     *
     * The optional parameter content can be used as value to fill into the new file.
     */
    createFile(uri: string, options?: { content?: string, encoding?: string }): Promise<FileStat>;

    /**
     * Creates a new folder with the given path. The returned promise
     * will have the stat model object as a result.
     */
    createFolder(uri: string): Promise<FileStat>;

    /**
     * Creates a new empty file if the given path does not exist and otherwise
     * will set the mtime and atime of the file to the current date.
     */
    touchFile(uri: string): Promise<FileStat>;

    /**
     * Deletes the provided file given as the filestat. The optional `moveToTrash` parameter allows to
     * move the file to trash instead of deleting it permanently.
     */
    delete(file: FileStat, options?: { moveToTrash?: boolean }): Promise<void>;

    /**
     * Allows to start a watcher that reports file change events on the provided resource.
     */
    watchFileChanges(uri: string): Promise<void>;

    /**
     * Allows to stop a watcher on the provided resource or absolute fs path.
     */
    unwatchFileChanges(uri: string): Promise<void>;

    /**
     * Returns the encoding of the given file resource.
     */
    getEncoding(uri: string): Promise<string>;

    /**
     * Returns the workspace root
     */
    getWorkspaceRoot(): Promise<FileStat>;

}

export namespace FileSystem {
    export declare type Configuration = {
        encoding: string,
        recursive: boolean,
        overwrite: boolean,
        moveToTrash: true,
    };
}

export interface FileSystemClient {
    /**
     * Notifies about file changes
     */
    onFileChanges(event: FileChangesEvent): void
}

export class FileChangesEvent {
    constructor(public readonly changes: FileChange[]) { }
}

export class FileChange {

    constructor(
        public readonly uri: string,
        public readonly type: FileChangeType) { }

    equals(other: any): boolean {
        return other instanceof FileChange && other.type === this.type && other.uri === this.uri;
    }

}

export enum FileChangeType {
    UPDATED = 0,
    ADDED = 1,
    DELETED = 2
}


/**
 * A file resource with meta information.
 */
export interface FileStat {

    /**
     * The URI of the file.
     */
    readonly uri: string;

    /**
     * The last modification of this file.
     */
    readonly lastModification: number;

    /**
     * The resource is a directory.
     */
    readonly isDirectory: boolean;

    /**
     * Return `true` when this is a directory that is not empty.
     */
    readonly hasChildren?: boolean;

    /**
     * The children of the file stat.
     * If it is `undefined` and `isDirectory` is `true`, then this file stat is unresolved.
     */
    readonly children?: FileStat[];

    /**
     * The size of the file if known.
     */
    readonly size?: number;

}