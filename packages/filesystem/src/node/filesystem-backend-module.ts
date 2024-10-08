// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as path from 'path';
import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { ConnectionHandler, RpcConnectionHandler, ILogger } from '@theia/core/lib/common';
import { FileSystemWatcherServer, FileSystemWatcherService } from '../common/filesystem-watcher-protocol';
import { FileSystemWatcherServerClient } from './filesystem-watcher-client';
import { ParcelFileSystemWatcherService, ParcelFileSystemWatcherServerOptions } from './parcel-watcher/parcel-filesystem-service';
import { NodeFileUploadService } from './node-file-upload-service';
import { ParcelWatcherOptions } from './parcel-watcher/parcel-options';
import { DiskFileSystemProvider } from './disk-file-system-provider';
import {
    remoteFileSystemPath, RemoteFileSystemServer, RemoteFileSystemClient, FileSystemProviderServer, RemoteFileSystemProxyFactory
} from '../common/remote-file-system-provider';
import { FileSystemProvider } from '../common/files';
import { EncodingService } from '@theia/core/lib/common/encoding-service';
import { BackendApplicationContribution, IPCConnectionProvider } from '@theia/core/lib/node';
import { RpcProxyFactory, ConnectionErrorHandler } from '@theia/core';
import { FileSystemWatcherServiceDispatcher } from './filesystem-watcher-dispatcher';

export const WATCHER_SINGLE_THREADED = process.argv.includes('--no-cluster');
export const WATCHER_VERBOSE = process.argv.includes('--watcher-verbose');

export const FileSystemWatcherServiceProcessOptions = Symbol('FileSystemWatcherServiceProcessOptions');
/**
 * Options to control the way the `ParcelFileSystemWatcherService` process is spawned.
 */
export interface FileSystemWatcherServiceProcessOptions {
    /**
     * Path to the script that will run the `ParcelFileSystemWatcherService` in a new process.
     */
    entryPoint: string;
}

export default new ContainerModule(bind => {
    bind(EncodingService).toSelf().inSingletonScope();
    bindFileSystemWatcherServer(bind);
    bind(DiskFileSystemProvider).toSelf();
    bind(FileSystemProvider).toService(DiskFileSystemProvider);
    bind(FileSystemProviderServer).toSelf();
    bind(RemoteFileSystemServer).toService(FileSystemProviderServer);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler<RemoteFileSystemClient>(remoteFileSystemPath, client => {
            const server = ctx.container.get<RemoteFileSystemServer>(RemoteFileSystemServer);
            server.setClient(client);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        }, RemoteFileSystemProxyFactory)
    ).inSingletonScope();
    bind(NodeFileUploadService).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(NodeFileUploadService);
});

export function bindFileSystemWatcherServer(bind: interfaces.Bind): void {
    bind<ParcelWatcherOptions>(ParcelWatcherOptions).toConstantValue({});

    bind(FileSystemWatcherServiceDispatcher).toSelf().inSingletonScope();

    bind(FileSystemWatcherServerClient).toSelf();
    bind(FileSystemWatcherServer).toService(FileSystemWatcherServerClient);

    bind<FileSystemWatcherServiceProcessOptions>(FileSystemWatcherServiceProcessOptions).toDynamicValue(ctx => ({
        entryPoint: path.join(__dirname, 'parcel-watcher'),
    })).inSingletonScope();
    bind<ParcelFileSystemWatcherServerOptions>(ParcelFileSystemWatcherServerOptions).toDynamicValue(ctx => {
        const logger = ctx.container.get<ILogger>(ILogger);
        const watcherOptions = ctx.container.get<ParcelWatcherOptions>(ParcelWatcherOptions);
        return {
            parcelOptions: watcherOptions,
            verbose: WATCHER_VERBOSE,
            info: (message, ...args) => logger.info(message, ...args),
            error: (message, ...args) => logger.error(message, ...args),
        };
    }).inSingletonScope();

    bind<FileSystemWatcherService>(FileSystemWatcherService).toDynamicValue(
        ctx => WATCHER_SINGLE_THREADED
            ? createParcelFileSystemWatcherService(ctx)
            : spawnParcelFileSystemWatcherServiceProcess(ctx)
    ).inSingletonScope();
}

/**
 * Run the watch server in the current process.
 */
export function createParcelFileSystemWatcherService(ctx: interfaces.Context): FileSystemWatcherService {
    const options = ctx.container.get<ParcelFileSystemWatcherServerOptions>(ParcelFileSystemWatcherServerOptions);
    const dispatcher = ctx.container.get<FileSystemWatcherServiceDispatcher>(FileSystemWatcherServiceDispatcher);
    const server = new ParcelFileSystemWatcherService(options);
    server.setClient(dispatcher);
    return server;
}

/**
 * Run the watch server in a child process.
 * Return a proxy forwarding calls to the child process.
 */
export function spawnParcelFileSystemWatcherServiceProcess(ctx: interfaces.Context): FileSystemWatcherService {
    const options = ctx.container.get<FileSystemWatcherServiceProcessOptions>(FileSystemWatcherServiceProcessOptions);
    const dispatcher = ctx.container.get<FileSystemWatcherServiceDispatcher>(FileSystemWatcherServiceDispatcher);
    const serverName = 'parcel-watcher';
    const logger = ctx.container.get<ILogger>(ILogger);
    const watcherOptions = ctx.container.get<ParcelWatcherOptions>(ParcelWatcherOptions);
    const ipcConnectionProvider = ctx.container.get<IPCConnectionProvider>(IPCConnectionProvider);
    const proxyFactory = new RpcProxyFactory<FileSystemWatcherService>();
    const serverProxy = proxyFactory.createProxy();
    // We need to call `.setClient` before listening, else the JSON-RPC calls won't go through.
    serverProxy.setClient(dispatcher);
    const args: string[] = [
        `--watchOptions=${JSON.stringify(watcherOptions)}`
    ];
    if (WATCHER_VERBOSE) {
        args.push('--verbose');
    }
    ipcConnectionProvider.listen({
        serverName,
        entryPoint: options.entryPoint,
        errorHandler: new ConnectionErrorHandler({
            serverName,
            logger,
        }),
        env: process.env,
        args,
    }, connection => proxyFactory.listen(connection));
    return serverProxy;
}
