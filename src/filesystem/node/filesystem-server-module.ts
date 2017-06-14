
/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";
import { ConnectionHandler } from "../../messaging/common";
import { FileSystemNode } from './node-filesystem';
import { FileSystemWatcher, FileSystemClient } from '../common/filesystem-watcher';
import { FileSystem } from "../common/filesystem";
import { JsonRpcProxyFactory } from "../../messaging/common/proxy-factory";

export const fileSystemServerModule = new ContainerModule(bind => {
    bind(FileSystemWatcher).toSelf();

    bind(FileSystemNode).toSelf().inSingletonScope();
    bind(FileSystem).toDynamicValue(ctx => ctx.container.get(FileSystemNode)).inSingletonScope();

    bind<ConnectionHandler>(ConnectionHandler).toDynamicValue(ctx => {
        return {
            path: "/filesystem",
            onConnection: connection => {
                const fileSystem = ctx.container.get(FileSystem);
                const factory = new JsonRpcProxyFactory<FileSystemClient>("/filesystem", fileSystem);
                factory.onConnection(connection);
            }
        }
    }).inSingletonScope();
});
