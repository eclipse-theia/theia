/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as cluster from 'cluster';
import { ContainerModule, interfaces } from "inversify";
import { ConnectionHandler, JsonRpcConnectionHandler, ILogger } from "@theia/core/lib/common";
import { FileSystemNode } from './node-filesystem';
import { FileSystem, FileSystemClient, fileSystemPath } from "../common";
import { FileSystemWatcherServer, FileSystemWatcherClient, fileSystemWatcherPath } from '../common/filesystem-watcher-protocol';
import { FileSystemWatcherServerClient } from './filesystem-watcher-client';
import { NsfwFileSystemWatcherServer } from './nsfw-watcher/nsfw-filesystem-watcher';

export function bindFileSystem(bind: interfaces.Bind): void {
    bind(FileSystemNode).toSelf().inSingletonScope();
    bind(FileSystem).toDynamicValue(ctx => ctx.container.get(FileSystemNode)).inSingletonScope();
}

export function bindFileSystemWatcherServer(bind: interfaces.Bind): void {
    if (cluster.isMaster) {
        bind(FileSystemWatcherServer).toDynamicValue(ctx => {
            const logger = ctx.container.get<ILogger>(ILogger);
            return new NsfwFileSystemWatcherServer({
                info: (message, ...args) => logger.info(message, ...args),
                error: (message, ...args) => logger.error(message, ...args)
            });
        });
    } else {
        bind(FileSystemWatcherServerClient).toSelf();
        bind(FileSystemWatcherServer).toDynamicValue(ctx =>
            ctx.container.get(FileSystemWatcherServerClient)
        );
    }
}

export default new ContainerModule(bind => {
    bindFileSystem(bind);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<FileSystemClient>(fileSystemPath, client => {
            const server = ctx.container.get<FileSystem>(FileSystem);
            server.setClient(client);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        })
    ).inSingletonScope();

    bindFileSystemWatcherServer(bind);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<FileSystemWatcherClient>(fileSystemWatcherPath, client => {
            const server = ctx.container.get<FileSystemWatcherServer>(FileSystemWatcherServer);
            server.setClient(client);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        })
    ).inSingletonScope();
});
