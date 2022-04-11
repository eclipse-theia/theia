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
import { Writable } from 'stream';
import { Message } from 'vscode-ws-jsonrpc';
import { ConnectionErrorHandler, Disposable, DisposableCollection, Emitter, ILogger } from '../../common';
import { ArrayBufferReadBuffer, ArrayBufferWriteBuffer } from '../../common/message-rpc/array-buffer-message-buffer';
import { Channel, ChannelCloseEvent, MessageProvider } from '../../common/message-rpc/channel';
import { createIpcEnv } from './ipc-protocol';

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
        const childProcess = this.fork(options);
        const connection = this.createConnection(childProcess, options);
        const toStop = new DisposableCollection();
        const toCancelStop = toStop.push(Disposable.create(() => childProcess.kill()));
        const errorHandler = options.errorHandler;
        if (errorHandler) {
            connection.onError((e: [Error, Message | undefined, number | undefined]) => {
                if (errorHandler.shouldStop(e[0], e[1], e[2])) {
                    toStop.dispose();
                }
            });
            connection.onClose(() => {
                if (toStop.disposed) {
                    return;
                }
                if (errorHandler.shouldRestart()) {
                    toCancelStop.dispose();
                    toStop.push(this.doListen(options, acceptor));
                }
            });
        }
        acceptor(connection);
        return toStop;
    }

    protected createConnection(childProcess: cp.ChildProcess, options?: ResolvedIPCConnectionOptions): Channel {

        const onCloseEmitter = new Emitter<ChannelCloseEvent>();
        const onMessageEmitter = new Emitter<MessageProvider>();
        const onErrorEmitter = new Emitter<unknown>();
        const pipe = childProcess.stdio[4] as Writable;

        pipe.on('data', (data: Uint8Array) => {
            onMessageEmitter.fire(() => new ArrayBufferReadBuffer(data.buffer));
        });

        childProcess.on('error', err => onErrorEmitter.fire(err));
        childProcess.on('exit', code => onCloseEmitter.fire({ reason: 'Child process been terminated', code: code ?? undefined }));

        return {
            close: () => { },
            onClose: onCloseEmitter.event,
            onError: onErrorEmitter.event,
            onMessage: onMessageEmitter.event,
            getWriteBuffer: () => {
                const result = new ArrayBufferWriteBuffer();
                result.onCommit(buffer => {
                    pipe.write(new Uint8Array(buffer));
                });

                return result;
            }
        };
    }

    protected fork(options: ResolvedIPCConnectionOptions): cp.ChildProcess {
        const forkOptions: cp.ForkOptions = {
            env: createIpcEnv(options),
            execArgv: [],
            stdio: ['pipe', 'pipe', 'pipe', 'ipc', 'pipe']
        };
        const inspectArgPrefix = `--${options.serverName}-inspect`;
        const inspectArg = process.argv.find(v => v.startsWith(inspectArgPrefix));
        if (inspectArg !== undefined) {
            forkOptions.execArgv = ['--nolazy', `--inspect${inspectArg.substr(inspectArgPrefix.length)}`];
        }

        const childProcess = cp.fork(path.join(__dirname, 'ipc-bootstrap'), options.args, forkOptions);
        childProcess.stdout!.on('data', data => {
            this.logger.info(`[${options.serverName}: ${childProcess.pid}] ${data.toString().trim()}`);
        });
        childProcess.stderr!.on('data', data => this.logger.error(`[${options.serverName}: ${childProcess.pid}] ${data.toString().trim()}`));

        this.logger.debug(`[${options.serverName}: ${childProcess.pid}] IPC started`);
        childProcess.once('exit', () => this.logger.debug(`[${options.serverName}: ${childProcess.pid}] IPC exited`));

        return childProcess;
    }

}
