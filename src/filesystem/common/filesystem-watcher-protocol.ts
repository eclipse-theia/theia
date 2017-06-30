/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Disposable } from '../../application/common';
import { JsonRpcProxy } from "../../messaging/common";

export const fileSystemWatcherPath = '/services/fs-watcher';

export const FileSystemWatcherServer = Symbol('FileSystemWatcherServer');
export interface FileSystemWatcherServer extends Disposable {
    /**
     * Start file watching under the given uri.
     * Resolve when watching is started.
     * Return a wathcer id.
     */
    watchFileChanges(uri: string): Promise<number>;

    /**
     * Stop file watching for the given id.
     * Resolve when watching is stopped.
     */
    unwatchFileChanges(watcher: number): Promise<void>;

    setClient(client: FileSystemWatcherClient): void;
}

export interface FileSystemWatcherClient {
    /**
     * Notify when files under watched uris are changed.
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

export const FileSystemWatcherServerProxy = Symbol('FileSystemWatcherServerProxy')
export type FileSystemWatcherServerProxy = JsonRpcProxy<FileSystemWatcherServer>;

@injectable()
export class ReconnectingFileSystemWatcherServer implements FileSystemWatcherServer {

    protected watcherSequence = 1;
    protected readonly watchOptions = new Map<number, string>();
    protected readonly localToRemoteWatcher = new Map<number, number>();

    constructor(
        @inject(FileSystemWatcherServerProxy) protected readonly proxy: FileSystemWatcherServerProxy
    ) {
        this.proxy.onDidOpenConnection(() => this.reconnect());
    }

    protected reconnect(): void {
        for (const [watcher, uri] of this.watchOptions.entries()) {
            this.doWatchFileChanges(watcher, uri);
        }
    }

    dispose(): void {
        this.proxy.dispose();
    }

    watchFileChanges(uri: string): Promise<number> {
        const watcher = this.watcherSequence++;
        this.watchOptions.set(watcher, uri);
        return this.doWatchFileChanges(watcher, uri);
    }

    protected doWatchFileChanges(watcher: number, uri: string): Promise<number> {
        return this.proxy.watchFileChanges(uri).then(remote => {
            this.localToRemoteWatcher.set(watcher, remote)
            return watcher;
        });
    }

    unwatchFileChanges(watcher: number): Promise<void> {
        this.watchOptions.delete(watcher);
        const remote = this.localToRemoteWatcher.get(watcher);
        if (remote) {
            this.localToRemoteWatcher.delete(watcher);
            return this.proxy.unwatchFileChanges(remote);
        }
        return Promise.resolve();
    }

    setClient(client: FileSystemWatcherClient): void {
        this.proxy.setClient(client);
    }

}