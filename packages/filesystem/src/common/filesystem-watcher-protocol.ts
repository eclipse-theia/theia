/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { JsonRpcServer, JsonRpcProxy } from '@theia/core';

export const fileSystemWatcherPath = '/services/fs-watcher';

export const FileSystemWatcherServer = Symbol('FileSystemWatcherServer');
export interface FileSystemWatcherServer extends JsonRpcServer<FileSystemWatcherClient> {
    /**
     * Start file watching for the given param.
     * Resolve when watching is started.
     * Return a watcher id.
     */
    watchFileChanges(uri: string, options?: WatchOptions): Promise<number>;

    /**
     * Stop file watching for the given id.
     * Resolve when watching is stopped.
     */
    unwatchFileChanges(watcher: number): Promise<void>;
}

export interface FileSystemWatcherClient {
    /**
     * Notify when files under watched uris are changed.
     */
    onDidFilesChanged(event: DidFilesChangedParams): void;
}

export interface WatchOptions {
    ignored: string[];
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

export const FileSystemWatcherServerProxy = Symbol('FileSystemWatcherServerProxy');
export type FileSystemWatcherServerProxy = JsonRpcProxy<FileSystemWatcherServer>;

@injectable()
export class ReconnectingFileSystemWatcherServer implements FileSystemWatcherServer {

    protected watcherSequence = 1;
    protected readonly watchParams = new Map<number, {
        uri: string;
        options?: WatchOptions
    }>();
    protected readonly localToRemoteWatcher = new Map<number, number>();

    constructor(
        @inject(FileSystemWatcherServerProxy) protected readonly proxy: FileSystemWatcherServerProxy
    ) {
        const onInitialized = this.proxy.onDidOpenConnection(() => {
            // skip reconnection on the first connection
            onInitialized.dispose();
            this.proxy.onDidOpenConnection(() => this.reconnect());
        });
    }

    protected reconnect(): void {
        for (const [watcher, { uri, options }] of this.watchParams.entries()) {
            this.doWatchFileChanges(watcher, uri, options);
        }
    }

    dispose(): void {
        this.proxy.dispose();
    }

    watchFileChanges(uri: string, options?: WatchOptions): Promise<number> {
        const watcher = this.watcherSequence++;
        this.watchParams.set(watcher, { uri, options });
        return this.doWatchFileChanges(watcher, uri, options);
    }

    protected doWatchFileChanges(watcher: number, uri: string, options?: WatchOptions): Promise<number> {
        return this.proxy.watchFileChanges(uri, options).then(remote => {
            this.localToRemoteWatcher.set(watcher, remote);
            return watcher;
        });
    }

    unwatchFileChanges(watcher: number): Promise<void> {
        this.watchParams.delete(watcher);
        const remote = this.localToRemoteWatcher.get(watcher);
        if (remote) {
            this.localToRemoteWatcher.delete(watcher);
            return this.proxy.unwatchFileChanges(remote);
        }
        return Promise.resolve();
    }

    setClient(client: FileSystemWatcherClient | undefined): void {
        this.proxy.setClient(client);
    }

}
