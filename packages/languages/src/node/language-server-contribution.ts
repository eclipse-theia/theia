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

import * as net from 'net';
import * as cp from 'child_process';
import { injectable, inject } from 'inversify';
import { Message, isRequestMessage } from 'vscode-ws-jsonrpc';
import { InitializeParams, InitializeRequest } from 'vscode-languageserver-protocol';
import {
    createProcessSocketConnection,
    createStreamConnection,
    forward,
    IConnection
} from 'vscode-ws-jsonrpc/lib/server';
import { MaybePromise } from '@theia/core/lib/common';
import { LanguageContribution } from '../common';
import { RawProcess, RawProcessFactory } from '@theia/process/lib/node/raw-process';
import { ProcessManager } from '@theia/process/lib/node/process-manager';
import { ProcessErrorEvent } from '@theia/process/lib/node/process';

export {
    LanguageContribution, IConnection, Message
};

export interface LanguageServerStartOptions {
    sessionId: string
    // tslint:disable-next-line:no-any
    parameters?: any
}

export const LanguageServerContribution = Symbol('LanguageServerContribution');
export interface LanguageServerContribution extends LanguageContribution {
    start(clientConnection: IConnection, options: LanguageServerStartOptions): MaybePromise<void>;
}

@injectable()
export abstract class BaseLanguageServerContribution implements LanguageServerContribution {

    abstract readonly id: string;
    abstract readonly name: string;

    @inject(RawProcessFactory)
    protected readonly processFactory: RawProcessFactory;

    @inject(ProcessManager)
    protected readonly processManager: ProcessManager;

    abstract start(clientConnection: IConnection, options: LanguageServerStartOptions): void;
    protected forward(clientConnection: IConnection, serverConnection: IConnection): void {
        forward(clientConnection, serverConnection, this.map.bind(this));
    }

    protected map(message: Message): Message {
        if (isRequestMessage(message)) {
            if (message.method === InitializeRequest.type.method) {
                const initializeParams = message.params as InitializeParams;
                initializeParams.processId = process.pid;
            }
        }
        return message;
    }

    protected async createProcessSocketConnection(outSocket: MaybePromise<net.Socket>, inSocket: MaybePromise<net.Socket>,
        command: string, args?: string[], options?: cp.SpawnOptions): Promise<IConnection> {

        const process = await this.spawnProcessAsync(command, args, options);
        const [outSock, inSock] = await Promise.all([outSocket, inSocket]);
        return createProcessSocketConnection(process.process, outSock, inSock);
    }

    /**
     * @deprecated use `createProcessStreamConnectionAsync` instead.
     * Otherwise, the backend cannot notify the client if the LS has failed at start-up.
     */
    protected createProcessStreamConnection(command: string, args?: string[], options?: cp.SpawnOptions): IConnection {
        const process = this.spawnProcess(command, args, options);
        return createStreamConnection(process.output, process.input, () => process.kill());
    }

    protected async createProcessStreamConnectionAsync(command: string, args?: string[], options?: cp.SpawnOptions): Promise<IConnection> {
        const process = await this.spawnProcessAsync(command, args, options);
        return createStreamConnection(process.output, process.input, () => process.kill());
    }

    /**
     * @deprecated use `spawnProcessAsync` instead.
     */
    protected spawnProcess(command: string, args?: string[], options?: cp.SpawnOptions): RawProcess {
        const rawProcess = this.processFactory({ command, args, options });
        rawProcess.process.once('error', this.onDidFailSpawnProcess.bind(this));
        rawProcess.process.stderr.on('data', this.logError.bind(this));
        return rawProcess;
    }

    protected spawnProcessAsync(command: string, args?: string[], options?: cp.SpawnOptions): Promise<RawProcess> {
        const rawProcess = this.processFactory({ command, args, options });
        rawProcess.process.stderr.on('data', this.logError.bind(this));
        return new Promise<RawProcess>((resolve, reject) => {
            rawProcess.onError((error: ProcessErrorEvent) => {
                this.onDidFailSpawnProcess(error);
                if (error.code === 'ENOENT') {
                    const guess = command.split(/\s+/).shift();
                    if (guess) {
                        reject(new Error(`Failed to spawn ${guess}\nPerhaps it is not on the PATH.`));
                        return;
                    }
                }
                reject(error);
            });
            process.nextTick(() => resolve(rawProcess));
        });
    }

    protected onDidFailSpawnProcess(error: ProcessErrorEvent): void {
        console.error(error);
    }

    protected logError(data: string | Buffer) {
        if (data) {
            console.error(`${this.name}: ${data}`);
        }
    }

    protected logInfo(data: string | Buffer) {
        if (data) {
            console.info(`${this.name}: ${data}`);
        }
    }

    protected startSocketServer(): Promise<net.Server> {
        return new Promise(resolve => {
            const server = net.createServer();
            server.addListener('listening', () =>
                resolve(server)
            );
            // allocate ports dynamically
            server.listen(0, '127.0.0.1');
        });
    }

    protected accept(server: net.Server): Promise<net.Socket> {
        return new Promise((resolve, reject) => {
            server.on('error', reject);
            server.on('connection', socket => {
                // stop accepting new connections
                server.close();
                resolve(socket);
            });
        });
    }

}
