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

import * as path from 'path';
import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { ServiceContribution, BackendAndFrontend } from '@theia/core/lib/common';
import { FileSystemWatcherOptions, FileSystemWatcherServer, FILE_SYSTEM_WATCHER_SERVER_PATH } from '../common/filesystem-watcher-protocol';
import { NodeFileUploadService } from './node-file-upload-service';
import { DiskFileSystemProvider } from './disk-file-system-provider';
import { remoteFileSystemPath, RemoteFileSystemServer, FileSystemProviderServer } from '../common/remote-file-system-provider';
import { FileSystemProvider } from '../common/files';
import { EncodingService } from '@theia/core/lib/common/encoding-service';
import { BackendApplicationContribution, cluster, JsonRpcIpcProxyProvider } from '@theia/core/lib/node';
import { fork } from 'child_process';
import { NsfwFileSystemWatcherServer } from './nsfw-filesystem-watcher-server';

export const NSFW_SINGLE_THREADED = cluster;
export const NSFW_WATCHER_VERBOSE = process.argv.includes('--nsfw-watcher-verbose');

export default new ContainerModule(bind => {
    // #region transients
    bind(DiskFileSystemProvider).toSelf().inTransientScope();
    bind(FileSystemProvider).toService(DiskFileSystemProvider);
    bind(FileSystemProviderServer).toSelf().inTransientScope();
    bind(RemoteFileSystemServer).toService(FileSystemProviderServer);
    // #endregion
    // #region singletons
    bind(EncodingService).toSelf().inSingletonScope();
    bind(NodeFileUploadService).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(NodeFileUploadService);
    // #endregion
    bindFileSystemWatcherServer(bind);
    bind(ServiceContribution)
        .toDynamicValue(ctx => ServiceContribution.fromEntries(
            [remoteFileSystemPath, (params, lifecycle) => lifecycle.track(ctx.container.get(RemoteFileSystemServer)).ref()],
            [FILE_SYSTEM_WATCHER_SERVER_PATH, () => ctx.container.get(FileSystemWatcherServer)]
        ))
        .inSingletonScope()
        .whenTargetNamed(BackendAndFrontend);
});

export function bindFileSystemWatcherServer(bind: interfaces.Bind): void {
    bind(FileSystemWatcherOptions).toConstantValue({});
    bind(FileSystemWatcherServer)
        .toDynamicValue(ctx => NSFW_SINGLE_THREADED
            ? createNsfwFileSystemWatcherServer(ctx)
            : spawnNsfwFileSystemWatcherServerProcess(ctx)
        )
        .inSingletonScope();
}

/**
 * Run the watch server in the current process.
 */
export function createNsfwFileSystemWatcherServer(ctx: interfaces.Context): FileSystemWatcherServer {
    const options = ctx.container.get(FileSystemWatcherOptions);
    return new NsfwFileSystemWatcherServer(options);
}

/**
 * Run the watch server in a child process.
 * Return a proxy forwarding calls to the child process.
 */
export function spawnNsfwFileSystemWatcherServerProcess(ctx: interfaces.Context): FileSystemWatcherServer {
    const options = ctx.container.get(FileSystemWatcherOptions);
    const args: string[] = [];
    if (NSFW_WATCHER_VERBOSE || options.verbose) {
        args.push('--verbose');
    }
    if (options.eventDebounceMs) {
        args.push(`--eventDebounceMs=${options.eventDebounceMs}`);
    }
    return ctx.container.get(JsonRpcIpcProxyProvider).createIpcProxy<FileSystemWatcherServer>(
        'nsfw',
        ipc => fork(path.join(__dirname, '..', 'nsfw-watcher-server', 'main'), args, {
            ...ipc.createForkOptions(),
            env: ipc.createEnv(),
            execArgv: ipc.createExecArgv()
        })
    );
}
