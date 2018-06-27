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
