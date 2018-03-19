/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { TextDocumentContentChangeEvent } from 'vscode-languageserver-types';
import { JsonRpcServer } from '@theia/core/lib/common';

export const fileSystemPath = '/services/filesystem';

export const FileSystem = Symbol("FileSystem");

export interface FileSystem extends JsonRpcServer<FileSystemClient> {

    /**
     * Returns the filestat for the given uri.
     *
     * If the uri points to a folder it will contain one level of unresolved children.
     *
     * Reject if a file for the given uri does not exist.
     */
    getFileStat(uri: string): Promise<FileStat>;

    /**
     * Finds out if a file identified by the resource exists.
     */
    exists(uri: string): Promise<boolean>;

    /**
     * Resolve the contents of a file identified by the resource.
     */
    resolveContent(uri: string, options?: { encoding?: string }): Promise<{ stat: FileStat, content: string }>;

    /**
     * Updates the content replacing its previous value.
     */
    setContent(file: FileStat, content: string, options?: { encoding?: string }): Promise<FileStat>;

    /**
     * Updates the content replacing its previous value.
     */
    updateContent(file: FileStat, contentChanges: TextDocumentContentChangeEvent[], options?: { encoding?: string }): Promise<FileStat>;

    /**
     * Moves the file to a new path identified by the resource.
     *
     * The optional parameter overwrite can be set to replace an existing file at the location.
     *
     * |           | missing | file | empty dir |    dir    |
     * |-----------|---------|------|-----------|-----------|
     * | missing   |    x    |   x  |     x     |     x     |
     * | file      |    ✓    |   x  |     x     |     x     |
     * | empty dir |    ✓    |   x  |     x     | overwrite |
     * | dir       |    ✓    |   x  | overwrite | overwrite |
     *
     */
    move(sourceUri: string, targetUri: string, options?: { overwrite?: boolean }): Promise<FileStat>;

    /**
     * Copies the file to a path identified by the resource.
     *
     * The optional parameter overwrite can be set to replace an existing file at the location.
     */
    copy(sourceUri: string, targetUri: string, options?: { overwrite?: boolean, recursive?: boolean }): Promise<FileStat>;

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
     * Deletes the provided file. The optional moveToTrash parameter allows to
     * move the file to trash.
     */
    delete(uri: string, options?: { moveToTrash?: boolean }): Promise<void>;

    /**
     * Returns the encoding of the given file resource.
     */
    getEncoding(uri: string): Promise<string>;

    /**
     * Return list of available roots.
     */
    getRoots(): Promise<FileStat[]>;

    /**
     * Returns a promise the resolves to a file stat representing the current user's home directory.
     */
    getCurrentUserHome(): Promise<FileStat>;

}

export interface FileSystemClient {

    /**
     * Tests whether the given file can be overwritten
     * in the case if it is out of sync with the given file stat.
     */
    shouldOverwrite(file: FileStat, stat: FileStat): Promise<boolean>;

}

/**
 * A file resource with meta information.
 */
export interface FileStat {

    /**
     * The uri of the file.
     */
    uri: string;

    /**
     * The last modification of this file.
     */
    lastModification: number;

    /**
     * The resource is a directory. Iff {{true}}
     * {{encoding}} has no meaning.
     */
    isDirectory: boolean;

    /**
     * The children of the file stat.
     * If it is undefined and isDirectory is true, then this file stat is unresolved.
     */
    children?: FileStat[];

    /**
     * The size of the file if known.
     */
    size?: number;

}

export namespace FileStat {
    export function is(candidate: object): candidate is FileStat {
        return candidate.hasOwnProperty('uri')
            && candidate.hasOwnProperty('lastModification')
            && candidate.hasOwnProperty('isDirectory');
    }
}
