// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable, Event, serviceIdentifier, servicePath } from '@theia/core';
import { FileChangeType } from './files';
export { FileChangeType };

export interface WatchOptions {
    ignored?: string[];
}

export interface DidFilesChangedParams {
    /**
     * FileSystem changes that occurred.
     */
    changes: FileChange[];
}

export interface FileSystemWatcherErrorParams {
    /**
     * The uri that originated the error.
     */
    uri: string;
}

export interface FileChange {
    uri: string;
    type: FileChangeType;
}

export const FileSystemWatcherOptions = serviceIdentifier<FileSystemWatcherOptions>('FileSystemWatcherOptions');
export interface FileSystemWatcherOptions {
    /**
     * Amount of time in ms between change event emission.
     */
    eventDebounceMs?: number
    /**
     * @default false
     */
    verbose?: boolean
}

/**
 * @internal
 */
export const FILE_SYSTEM_WATCHER_SERVER_PATH = servicePath<FileSystemWatcherServer>('/services/file-system-watcher-server');
/**
 * @internal
 */
export const FileSystemWatcherServer = serviceIdentifier<FileSystemWatcherServer>('FileSystemWatcherServer');
export interface FileSystemWatcherServer {
    onDidFilesChanged: Event<DidFilesChangedParams & { watcherId: number }>;
    onError: Event<FileSystemWatcherErrorParams & { watcherId: number }>;
    watchFileChanges(uri: string, options?: WatchOptions): Promise<number>;
    unwatchFileChanges(watcherId: number): Promise<void>;
}

export const FileSystemWatcherService = serviceIdentifier<FileSystemWatcherService>('FileSystemWatcherService');
export interface FileSystemWatcherService {
    onError: Event<FileSystemWatcherErrorParams>;
    watchFileChanges(uri: string, options?: WatchOptions): FileSystemWatcher;
}

export interface FileSystemWatcher extends Disposable {
    onDidFilesChanged: Event<DidFilesChangedParams>;
    onError: Event<FileSystemWatcherErrorParams>;
}
