// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

import { ConnectionErrorHandler, ILogger, JsonRpcProxyFactory } from '@theia/core';
import { IPCConnectionProvider } from '@theia/core/lib/node';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileSystemWatcherClient } from '../common/filesystem-watcher-protocol';
import { FileSystemWatcherCli } from './filesystem-watcher-cli';
import { NsfwFileSystemWatcherService } from './nsfw-watcher/nsfw-filesystem-watcher-service';
import path = require('path');
import nsfw = require('@theia/core/shared/nsfw');

@injectable()
export class NsfwFileSystemWatcherFactory {

    @inject(ILogger)
    protected logger: ILogger;

    @inject(FileSystemWatcherCli)
    protected cli: FileSystemWatcherCli;

    @inject(IPCConnectionProvider)
    protected ipc: IPCConnectionProvider;

    getFileSystemWatcherServer(client?: FileSystemWatcherClient): NsfwFileSystemWatcherService {
        return this.cli.singleThreaded
            ? this.createFileSystemWatcherServer(client)
            : this.spawnFileSystemWatcherServer(client);
    }

    protected createFileSystemWatcherServer(client?: FileSystemWatcherClient): NsfwFileSystemWatcherService {
        const server = new NsfwFileSystemWatcherService({
            nsfwOptions: this.getNsfwOptions(),
            verbose: this.cli.watcherVerbose,
            logger: this.logger
        });
        if (client) {
            server.setClient(client);
        }
        return server;
    }

    protected spawnFileSystemWatcherServer(client?: FileSystemWatcherClient): NsfwFileSystemWatcherService {
        const proxyFactory = new JsonRpcProxyFactory<NsfwFileSystemWatcherService>(client);
        const args: string[] = [
            `--nsfwOptions=${JSON.stringify(this.getNsfwOptions())}`
        ];
        if (this.cli.watcherVerbose) {
            args.push('--verbose');
        }
        const serverName = 'nsfw-watcher';
        this.ipc.listen({
            serverName,
            entryPoint: this.getFileSystemWatcherEntryPoint(),
            errorHandler: new ConnectionErrorHandler({
                serverName,
                logger: this.logger,
            }),
            env: process.env,
            args,
        }, connection => {
            proxyFactory.listen(connection);
        });
        return proxyFactory.createProxy();
    }

    /**
     * Path to the script that will run the `NsfwFileSystemWatcherService` in a new process.
     */
    protected getFileSystemWatcherEntryPoint(): string {
        return path.join(__dirname, 'nsfw-watcher');
    }

    protected getNsfwOptions(): nsfw.Options {
        return {};
    }
}
