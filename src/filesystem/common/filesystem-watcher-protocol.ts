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
     */
    watchFileChanges(uri: string): Promise<void>;

    /**
     * Stop file watching under the given uri.
     * Resolve when watching is stopped.
     */
    unwatchFileChanges(uri: string): Promise<void>;
}

export interface FileSystemWatcherClient extends Disposable {
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

    protected readonly uris = new Set<string>();

    constructor(
        @inject(FileSystemWatcherServerProxy) protected readonly proxy: FileSystemWatcherServerProxy
    ) {
        this.proxy.onDidOpenConnection(() => this.reconnect());
    }

    protected reconnect(): void {
        for (const uri of this.uris) {
            this.proxy.watchFileChanges(uri);
        }
    }

    dispose(): void {
        this.proxy.dispose();
    }

    watchFileChanges(uri: string): Promise<void> {
        this.uris.add(uri)
        return this.proxy.watchFileChanges(uri);
    }

    unwatchFileChanges(uri: string): Promise<void> {
        return this.proxy.unwatchFileChanges(uri).then(() => {
            this.uris.delete(uri)
        });
    }

}