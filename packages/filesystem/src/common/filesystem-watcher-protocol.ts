/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { JsonRpcServer, JsonRpcProxy } from '@theia/core';
import { FileChangeType } from './files';
export { FileChangeType };

export const FileSystemWatcherService = Symbol('FileSystemWatcherServer2');
/**
 * Singleton implementation of the watch server.
 *
 * Since multiple clients all make requests to this service, we need to track those individually via a `clientId`.
 */
export interface FileSystemWatcherService extends JsonRpcServer<FileSystemWatcherServiceClient> {
    /**
     * @param clientId arbitrary id used to identify a client.
     * @param uri the path to watch.
     * @param options optional parameters.
     * @returns promise to a unique `number` handle for this request.
     */
    watchFileChanges(clientId: number, uri: string, options?: WatchOptions): Promise<number>;
    /**
     * @param watcherId handle mapping to a previous `watchFileChanges` request.
     */
    unwatchFileChanges(watcherId: number): Promise<void>;
}

export interface FileSystemWatcherServiceClient {
    /** Listen for change events emitted by the watcher. */
    onDidFilesChanged(event: DidFilesChangedParams): void;
    /** The watcher can crash in certain conditions. */
    onError(event: FileSystemWatcherErrorParams): void;
}

export interface DidFilesChangedParams {
    /** Clients to route the events to. */
    clients?: number[];
    /** FileSystem changes that occurred. */
    changes: FileChange[];
}

export interface FileSystemWatcherErrorParams {
    /** Clients to route the events to. */
    clients: number[];
    /** The uri that originated the error. */
    uri: string;
}

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
    unwatchFileChanges(watcherId: number): Promise<void>;
}

export interface FileSystemWatcherClient {
    /**
     * Notify when files under watched uris are changed.
     */
    onDidFilesChanged(event: DidFilesChangedParams): void;

    /**
     * Notify when unable to watch files because of Linux handle limit.
     */
    onError(): void;
}

export interface WatchOptions {
    ignored: string[];
}
export interface FileChange {
    uri: string;
    type: FileChangeType;
}

export const FileSystemWatcherServerProxy = Symbol('FileSystemWatcherServerProxy');
export type FileSystemWatcherServerProxy = JsonRpcProxy<FileSystemWatcherServer>;

/**
 * @deprecated not used internally anymore.
 */
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
