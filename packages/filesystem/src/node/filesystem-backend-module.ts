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

import * as path from 'path';
import { ContainerModule, interfaces } from 'inversify';
import { ConnectionHandler, JsonRpcConnectionHandler, ILogger } from '@theia/core/lib/common';
import { FileSystemWatcherServer, FileSystemWatcherService } from '../common/filesystem-watcher-protocol';
import { FileSystemWatcherServerClient } from './filesystem-watcher-client';
import { NsfwFileSystemWatcherService } from './nsfw-watcher/nsfw-filesystem-service';
import { MessagingService } from '@theia/core/lib/node/messaging/messaging-service';
import { NodeFileUploadService } from './node-file-upload-service';
import { NsfwOptions } from './nsfw-watcher/nsfw-options';
import { DiskFileSystemProvider } from './disk-file-system-provider';
import {
    remoteFileSystemPath, RemoteFileSystemServer, RemoteFileSystemClient, FileSystemProviderServer, RemoteFileSystemProxyFactory
} from '../common/remote-file-system-provider';
import { FileSystemProvider } from '../common/files';
import { EncodingService } from '@theia/core/lib/common/encoding-service';
import { IPCConnectionProvider } from '@theia/core/lib/node';
import { JsonRpcProxyFactory, ConnectionErrorHandler } from '@theia/core';
import { FileSystemWatcherServiceDispatcher } from './filesystem-watcher-dispatcher';

const SINGLE_THREADED = process.argv.indexOf('--no-cluster') !== -1;
const NSFW_WATCHER_VERBOSE = process.argv.indexOf('--nsfw-watcher-verbose') !== -1;

export function bindFileSystemWatcherServer(bind: interfaces.Bind, { singleThreaded }: { singleThreaded: boolean } = { singleThreaded: SINGLE_THREADED }): void {
    bind<NsfwOptions>(NsfwOptions).toConstantValue({});

    bind(FileSystemWatcherServiceDispatcher).toSelf().inSingletonScope();

    bind(FileSystemWatcherServerClient).toSelf();
    bind(FileSystemWatcherServer).toService(FileSystemWatcherServerClient);

    if (singleThreaded) {
        // Bind and run the watch server in the current process:
        bind<FileSystemWatcherService>(FileSystemWatcherService).toDynamicValue(ctx => {
            const logger = ctx.container.get<ILogger>(ILogger);
            const nsfwOptions = ctx.container.get<NsfwOptions>(NsfwOptions);
            const dispatcher = ctx.container.get<FileSystemWatcherServiceDispatcher>(FileSystemWatcherServiceDispatcher);
            const server = new NsfwFileSystemWatcherService({
                nsfwOptions,
                verbose: NSFW_WATCHER_VERBOSE,
                info: (message, ...args) => logger.info(message, ...args),
                error: (message, ...args) => logger.error(message, ...args)
            });
            server.setClient(dispatcher);
            return server;
        }).inSingletonScope();
    } else {
        // Run the watch server in a child process.
        // Bind to a proxy forwarding calls to the child process.
        bind<FileSystemWatcherService>(FileSystemWatcherService).toDynamicValue(ctx => {
            const serverName = 'nsfw-watcher';
            const logger = ctx.container.get<ILogger>(ILogger);
            const nsfwOptions = ctx.container.get<NsfwOptions>(NsfwOptions);
            const ipcConnectionProvider = ctx.container.get<IPCConnectionProvider>(IPCConnectionProvider);
            const dispatcher = ctx.container.get<FileSystemWatcherServiceDispatcher>(FileSystemWatcherServiceDispatcher);
            const proxyFactory = new JsonRpcProxyFactory<FileSystemWatcherService>();
            const serverProxy = proxyFactory.createProxy();
            // We need to call `.setClient` before listening, else the JSON-RPC calls won't go through.
            serverProxy.setClient(dispatcher);
            const args: string[] = [
                `--nsfwOptions=${JSON.stringify(nsfwOptions)}`
            ];
            if (NSFW_WATCHER_VERBOSE) {
                args.push('--verbose');
            }
            ipcConnectionProvider.listen({
                serverName,
                entryPoint: path.resolve(__dirname, serverName),
                errorHandler: new ConnectionErrorHandler({
                    serverName,
                    logger,
                }),
                env: process.env,
                args,
            }, connection => proxyFactory.listen(connection));
            return serverProxy;
        }).inSingletonScope();
    }
}

export default new ContainerModule(bind => {
    bind(EncodingService).toSelf().inSingletonScope();
    bindFileSystemWatcherServer(bind);
    bind(DiskFileSystemProvider).toSelf();
    bind(FileSystemProvider).toService(DiskFileSystemProvider);
    bind(FileSystemProviderServer).toSelf();
    bind(RemoteFileSystemServer).toService(FileSystemProviderServer);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<RemoteFileSystemClient>(remoteFileSystemPath, client => {
            const server = ctx.container.get<RemoteFileSystemServer>(RemoteFileSystemServer);
            server.setClient(client);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        }, RemoteFileSystemProxyFactory)
    ).inSingletonScope();
    bind(NodeFileUploadService).toSelf().inSingletonScope();
    bind(MessagingService.Contribution).toService(NodeFileUploadService);
});
