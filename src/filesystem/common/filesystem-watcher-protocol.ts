/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Disposable } from '../../application/common';

export const fileSystemWatcherPath = '/fs-watcher';

export const FileSystemWatcherServer = Symbol('FileSystemWatcherServer');
export interface FileSystemWatcherServer extends Disposable {
    /**
     * Allows to start a watcher that reports file change events on the provided resource.
     *
     * Resolve when watching of the given uri is started.
     * Reject if a file for the given uri does not exist.
     */
    watchFileChanges(uri: string): Promise<void>;

    /**
     * Allows to stop a watcher on the provided resource or absolute fs path.
     */
    unwatchFileChanges(uri: string): Promise<void>;
}

export interface FileSystemWatcherClient extends Disposable {
    /**
     * Notifies about file changes
     */
    onDidFilesChanged(event: DidFilesChangedParams): void;
}

export interface DidFilesChangedParams {
    changes: FileChange[];
}

export interface FileChange {
    uri: string;
    type: FileChangeType;
}

export enum FileChangeType {
    UPDATED = 0,
    ADDED = 1,
    DELETED = 2
}