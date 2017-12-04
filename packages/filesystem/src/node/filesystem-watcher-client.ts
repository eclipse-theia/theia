/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from "path";
import { injectable, inject } from "inversify";
import { JsonRpcProxyFactory, ILogger, ConnectionErrorHandler, DisposableCollection, Disposable } from "@theia/core";
import { IPCConnectionProvider } from "@theia/core/lib/node/messaging";
import { FileSystemWatcherServer, WatchOptions, FileSystemWatcherClient, ReconnectingFileSystemWatcherServer } from "../common/filesystem-watcher-protocol";

export const NSFW_WATCHER = 'nsfw-watcher';

@injectable()
export class FileSystemWatcherServerClient implements FileSystemWatcherServer {

    protected readonly proxyFactory = new JsonRpcProxyFactory<FileSystemWatcherServer>();
    protected readonly remote = new ReconnectingFileSystemWatcherServer(this.proxyFactory.createProxy());

    protected readonly toDispose = new DisposableCollection();

    constructor(
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(IPCConnectionProvider) protected readonly ipcConnectionProvider: IPCConnectionProvider
    ) {
        this.remote.setClient({
            onDidFilesChanged: e => {
                if (this.client) {
                    this.client.onDidFilesChanged(e);
                }
            }
        });
        this.toDispose.push(this.remote);
        this.toDispose.push(this.listen());
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    watchFileChanges(uri: string, options?: WatchOptions): Promise<number> {
        return this.remote.watchFileChanges(uri, options);
    }

    unwatchFileChanges(watcher: number): Promise<void> {
        return this.remote.unwatchFileChanges(watcher);
    }

    protected client: FileSystemWatcherClient | undefined;
    setClient(client: FileSystemWatcherClient | undefined): void {
        this.client = client;
    }

    protected listen(): Disposable {
        return this.ipcConnectionProvider.listen({
            serverName: NSFW_WATCHER,
            entryPoint: path.resolve(__dirname, NSFW_WATCHER),
            errorHandler: new ConnectionErrorHandler({
                serverName: NSFW_WATCHER,
                logger: this.logger
            })
        }, connection => this.proxyFactory.listen(connection));
    }

}
