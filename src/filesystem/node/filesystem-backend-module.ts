/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";
import { ConnectionHandler, JsonRpcConnectionHandler } from "../../messaging/common";
import { FileSystemNode } from './node-filesystem';
import { FileSystemWatcher, FileSystem, fileSystemPath, FileSystemWatcherClientListener } from "../common";
import { FileSystemWatcherServer, FileSystemWatcherClient, fileSystemWatcherPath } from '../common/filesystem-watcher-protocol';
import { ChokidarFileSystemWatcherServer } from './chokidar-filesystem-watcher';

export default new ContainerModule(bind => {
    bind(FileSystemNode).toSelf().inSingletonScope();
    bind(FileSystem).toDynamicValue(ctx => ctx.container.get(FileSystemNode)).inSingletonScope();

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler(fileSystemPath, () =>
            ctx.container.get(FileSystem)
        )
    ).inSingletonScope();

    bind(ChokidarFileSystemWatcherServer).toSelf();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<FileSystemWatcherClient>(fileSystemWatcherPath, client => {
            const server = ctx.container.get(ChokidarFileSystemWatcherServer);
            server.setClient(client);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        })
    ).inSingletonScope();

    bind(FileSystemWatcherClientListener).toSelf();
    bind(FileSystemWatcher).toDynamicValue(({ container }) => {
        const client = container.get(FileSystemWatcherClientListener);
        const server = container.get(ChokidarFileSystemWatcherServer);
        server.setClient(client);

        const child = container.createChild();
        child.bind(FileSystemWatcherClientListener).toConstantValue(client);
        child.bind(FileSystemWatcherServer).toConstantValue(server);
        child.bind(FileSystemWatcher).toSelf();
        return child.get(FileSystemWatcher);
    });
});
