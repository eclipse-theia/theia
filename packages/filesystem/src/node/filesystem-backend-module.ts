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

import { ContainerModule, interfaces } from 'inversify';
import { ConnectionHandler, JsonRpcConnectionHandler, ILogger } from '@theia/core/lib/common';
import { FileSystemNode } from './node-filesystem';
import { FileSystem, FileSystemClient, fileSystemPath, DispatchingFileSystemClient } from '../common';
import { FileSystemWatcherServer, FileSystemWatcherClient, fileSystemWatcherPath } from '../common/filesystem-watcher-protocol';
import { FileSystemWatcherServerClient } from './filesystem-watcher-client';
import { NsfwFileSystemWatcherServer } from './nsfw-watcher/nsfw-filesystem-watcher';
import { MessagingService } from '@theia/core/lib/node/messaging/messaging-service';
import { NodeFileUploadService } from './node-file-upload-service';

const SINGLE_THREADED = process.argv.indexOf('--no-cluster') !== -1;

export function bindFileSystem(bind: interfaces.Bind, props?: {
    onFileSystemActivation: (context: interfaces.Context, fs: FileSystem) => void
}): void {
    bind(FileSystemNode).toSelf().inSingletonScope().onActivation((context, fs) => {
        if (props && props.onFileSystemActivation) {
            props.onFileSystemActivation(context, fs);
        }
        return fs;
    });
    bind(FileSystem).toService(FileSystemNode);
}

export function bindFileSystemWatcherServer(bind: interfaces.Bind, { singleThreaded }: { singleThreaded: boolean } = { singleThreaded: SINGLE_THREADED }): void {
    if (singleThreaded) {
        bind(FileSystemWatcherServer).toDynamicValue(ctx => {
            const logger = ctx.container.get<ILogger>(ILogger);
            return new NsfwFileSystemWatcherServer({
                info: (message, ...args) => logger.info(message, ...args),
                error: (message, ...args) => logger.error(message, ...args)
            });
        });
    } else {
        bind(FileSystemWatcherServerClient).toSelf();
        bind(FileSystemWatcherServer).toService(FileSystemWatcherServerClient);
    }
}

export default new ContainerModule(bind => {
    bind(DispatchingFileSystemClient).toSelf().inSingletonScope();
    bindFileSystem(bind, {
        onFileSystemActivation: ({ container }, fs) => {
            fs.setClient(container.get(DispatchingFileSystemClient));
            fs.setClient = () => {
                throw new Error('use DispatchingFileSystemClient');
            };
        }
    });
    bind(ConnectionHandler).toDynamicValue(({ container }) =>
        new JsonRpcConnectionHandler<FileSystemClient>(fileSystemPath, client => {
            const dispatching = container.get(DispatchingFileSystemClient);
            dispatching.clients.add(client);
            client.onDidCloseConnection(() => dispatching.clients.delete(client));
            return container.get(FileSystem);
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

    bind(NodeFileUploadService).toSelf().inSingletonScope();
    bind(MessagingService.Contribution).toService(NodeFileUploadService);
});
