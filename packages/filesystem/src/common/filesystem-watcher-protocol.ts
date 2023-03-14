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

import { interfaces } from '@theia/core/shared/inversify';
import { FileChangeType } from './files';
export { FileChangeType };

export type WatcherId = number;
export type EventWatcherId = number;

export interface WatcherLogger {
    info(message: string, ...args: unknown[]): void
    error(message: string, ...args: unknown[]): void
}

export interface WatchOptions {
    ignored?: readonly string[];
}

export const FileSystemWatcherService = Symbol('FileSystemWatcherService') as symbol & interfaces.Abstract<FileSystemWatcherService>;
export interface FileSystemWatcherService {
    /**
     * @param client The object to receive requests.
     */
    setClient(client?: FileSystemWatcherClient): void;
    /**
     * Start file watching for the given param.
     * Resolve when watching is started.
     * Return a watcher id.
     */
    watchFileChanges(uri: string, options?: WatchOptions): Promise<[WatcherId, EventWatcherId]>;
    /**
     * Stop file watching for the given id.
     * Resolve when watching is stopped.
     */
    unwatchFileChanges(watcherId: WatcherId): Promise<void>;
}

export interface FileSystemWatcherClient {
    /**
     * Listen for change events emitted by the watcher.
     */
    onDidFilesChanged(event: DidFilesChangedParams): void;
    /**
     * The watcher can crash in certain conditions.
     */
    onError(event: FileSystemWatcherErrorParams): void;
}

export interface WatcherEvent {
    /**
     * Id of the watcher handle that originated the event.
     */
    eventId: EventWatcherId;
}

export interface DidFilesChangedParams extends WatcherEvent {
    /**
     * FileSystem changes that occurred.
     */
    changes: readonly FileChange[];
}

export interface FileSystemWatcherErrorParams extends WatcherEvent {
    /**
     * The uri that originated the error.
     */
    uri: string;
}

export interface FileChange {
    uri: string;
    type: FileChangeType;
}
