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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core/lib/common';
import { FileSystemWatcherService } from '../common/filesystem-watcher-protocol';
import { NodeFileUploadService } from './node-file-upload-service';
import { DiskFileSystemProvider } from './disk-file-system-provider';
import {
    remoteFileSystemPath, RemoteFileSystemServer, RemoteFileSystemClient, FileSystemProviderServer, RemoteFileSystemProxyFactory
} from '../common/remote-file-system-provider';
import { FileSystemProvider } from '../common/files';
import { EncodingService } from '@theia/core/lib/common/encoding-service';
import { BackendApplicationContribution, CliContribution } from '@theia/core/lib/node';
import { FileSystemWatcherServiceCache } from './filesystem-watcher-cache';
import { FileSystemWatcherCli } from './filesystem-watcher-cli';
import { NsfwFileSystemWatcherFactory } from './filesystem-watcher-factory';
import { DisposableFileSystemWatcherServiceFactory, FileSystemWatcherClientRegistry } from './disposable-watcher-service';
import { NsfwFileSystemWatcherService } from './nsfw-watcher/nsfw-filesystem-watcher-service';

export default new ContainerModule(bind => {
    bindFileSystemWatcherServer(bind);
    // Services
    bind(CliContribution).toService(FileSystemWatcherCli);
    bind(FileSystemProvider).toService(DiskFileSystemProvider);
    bind(RemoteFileSystemServer).toService(FileSystemProviderServer);
    bind(BackendApplicationContribution).toService(NodeFileUploadService);
    // Transients
    bind(DiskFileSystemProvider).toSelf();
    bind(FileSystemProviderServer).toSelf();
    // Singletons
    bind(EncodingService).toSelf().inSingletonScope();
    bind(FileSystemWatcherCli).toSelf().inSingletonScope();
    bind(NodeFileUploadService).toSelf().inSingletonScope();
    bind(ConnectionHandler)
        .toDynamicValue(ctx => new JsonRpcConnectionHandler<RemoteFileSystemClient>(remoteFileSystemPath, client => {
            const server = ctx.container.get<RemoteFileSystemServer>(RemoteFileSystemServer);
            server.setClient(client);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        }, RemoteFileSystemProxyFactory))
        .inSingletonScope();
});

export function bindFileSystemWatcherServer(bind: interfaces.Bind): void {
    // Transients
    bind(FileSystemWatcherClientRegistry).toSelf();
    bind(FileSystemWatcherService)
        .toDynamicValue(ctx => ctx.container.get(DisposableFileSystemWatcherServiceFactory).createDisposableFileSystemWatcherService());
    // Singletons
    bind(NsfwFileSystemWatcherFactory)
        .toSelf().inSingletonScope();
    bind(DisposableFileSystemWatcherServiceFactory)
        .toSelf().inSingletonScope()
        .onActivation((ctx, factory) => {
            const cache = ctx.container.get(FileSystemWatcherServiceCache);
            factory.setService(cache);
            cache.setClient(factory);
            return factory;
        });
    bind(FileSystemWatcherServiceCache)
        .toSelf().inSingletonScope()
        .onActivation((ctx, cache) => {
            const server = ctx.container.get(NsfwFileSystemWatcherService);
            cache.setService(server);
            return cache;
        });
    bind(NsfwFileSystemWatcherService)
        .toDynamicValue(ctx => ctx.container.get(NsfwFileSystemWatcherFactory).getFileSystemWatcherServer())
        .inSingletonScope();
}
