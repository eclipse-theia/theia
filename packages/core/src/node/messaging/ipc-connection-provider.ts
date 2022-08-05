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

import * as cp from 'child_process';
import { inject, injectable } from 'inversify';
import * as path from 'path';
import { createInterface } from 'readline';
import { Channel, ConnectionErrorHandler, Disposable, DisposableCollection, ILogger } from '../../common';
import { IPCChannel } from './ipc-channel';
import { createIpcEnv } from './ipc-protocol';
import { createIpcServer, IpcServer, THEIA_IPC_SERVER } from './ipc-server';

export interface ResolvedIPCConnectionOptions {
    readonly serverName: string
    readonly entryPoint: string
    readonly logger: ILogger
    readonly args: string[]
    readonly errorHandler?: ConnectionErrorHandler
    readonly env?: NodeJS.ProcessEnv
}
export type IPCConnectionOptions = Partial<ResolvedIPCConnectionOptions> & {
    readonly serverName: string
    readonly entryPoint: string
};

@injectable()
export class IPCConnectionProvider {

    @inject(ILogger)
    protected readonly logger: ILogger;

    listen(options: IPCConnectionOptions, acceptor: (connection: Channel) => void): Disposable {
        return this.doListen({
            logger: this.logger,
            args: [],
            ...options
        }, acceptor);
    }

    protected doListen(options: ResolvedIPCConnectionOptions, acceptor: (connection: Channel) => void): Disposable {
        const ipcServer = this.createIpcServer();
        const childProcess = this.fork(options, ipcServer.name);
        const toStop = new DisposableCollection();
        const toCancelStop = toStop.push(Disposable.create(() => childProcess.kill()));
        ipcServer.client.then(socket => {
            const channel = new IPCChannel(socket, childProcess);

            const errorHandler = options.errorHandler;
            if (errorHandler) {
                let errorCount = 0;
                channel.onError((err: Error) => {
                    errorCount++;
                    if (errorHandler.shouldStop(err, errorCount)) {
                        toStop.dispose();
                    }
                });
                channel.onClose(() => {
                    if (toStop.disposed) {
                        return;
                    }
                    if (errorHandler.shouldRestart()) {
                        toCancelStop.dispose();
                        toStop.push(this.doListen(options, acceptor));
                    }
                });
            }
            acceptor(channel);
        });

        return toStop;
    }

    protected createIpcServer(): IpcServer {
        return createIpcServer();
    }

    protected fork(options: ResolvedIPCConnectionOptions, ipcServerName: string): cp.ChildProcess {
        const forkOptions: cp.ForkOptions = {
            silent: true,
            env: this.createIpcEnv(options, ipcServerName),
            execArgv: []
        };
        const inspectArgPrefix = `--${options.serverName}-inspect`;
        const inspectArg = process.argv.find(v => v.startsWith(inspectArgPrefix));
        if (inspectArg !== undefined) {
            forkOptions.execArgv = ['--nolazy', `--inspect${inspectArg.substr(inspectArgPrefix.length)}`];
        }

        const childProcess = cp.fork(path.join(__dirname, 'ipc-bootstrap'), options.args, forkOptions);

        createInterface(childProcess.stdout!).on('line', line => this.logger.info(`[${options.serverName}: ${childProcess.pid}] ${line}`));
        createInterface(childProcess.stderr!).on('line', line => this.logger.error(`[${options.serverName}: ${childProcess.pid}] ${line}`));

        this.logger.debug(`[${options.serverName}: ${childProcess.pid}] IPC started`);
        childProcess.once('exit', () => this.logger.debug(`[${options.serverName}: ${childProcess.pid}] IPC exited`));

        return childProcess;
    }

    protected createIpcEnv(options: ResolvedIPCConnectionOptions, ipcServerName: string): NodeJS.ProcessEnv {
        const env = createIpcEnv(options);
        // Temporary add the name of the IPC server pipe as environment variable. The child process should delete
        // the variable after retrieving the name value.
        env[THEIA_IPC_SERVER] = ipcServerName;
        return env;
    }

}
