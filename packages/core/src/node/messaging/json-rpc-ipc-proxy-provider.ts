// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { createInterface } from 'readline';
import { ChildProcess } from 'child_process';
import { inject, injectable } from 'inversify';
import { Proxied } from '../../common/proxy';
import { createMessageConnection, Logger, IPCMessageReader, IPCMessageWriter } from 'vscode-jsonrpc/node';
import { Rpc } from '../../common';
import { JsonRpc } from '../../common/json-rpc';
import { createIpcEnv } from './ipc-protocol';

export interface IpcApi {
    /**
     * @param initialExecArgv default {@link process.execArgv}
     */
    createExecArgv(initialExecArgv?: string[]): string[] | undefined
    /**
     * @param initialEnv default {@link process.env}
     */
    createEnv(initialEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv | undefined
}

/**
 * This proxy provider will communicate with forked Node.js processes using:
 * https://nodejs.org/api/child_process.html#subprocesssendmessage-sendhandle-options-callback
 */
@injectable()
export class JsonRpcIpcProxyProvider {

    @inject(Rpc)
    protected rpc: Rpc;

    @inject(JsonRpc)
    protected jsonRpc: JsonRpc;

    createIpcProxy<T>(name: string, childProcessFactory: (ipc: IpcApi) => ChildProcess): Proxied<T> {
        const server = childProcessFactory(this.createIpcApi(name));
        if (!server.connected) {
            throw new Error('server process is not connected');
        }
        const reader = new IPCMessageReader(server);
        const writer = new IPCMessageWriter(server);
        const logger = this.createLogger(name, server);
        if (server.stdout) {
            createInterface(server.stdout).on('line', line => logger.log(line));
        }
        if (server.stderr) {
            createInterface(server.stderr).on('line', line => logger.error(line));
        }
        const messageConnection = createMessageConnection(reader, writer, logger);
        const rpcConnection = this.jsonRpc.createRpcConnection(messageConnection);
        return this.rpc.createProxy<T>(rpcConnection);
    }

    protected createIpcApi(name: string): IpcApi {
        const inspect = this.getInspectFlag(name, process.argv);
        return {
            createExecArgv: (initialExecArgv = process.execArgv) => {
                const execArgv = [...initialExecArgv];
                if (inspect) {
                    execArgv.push('--no-lazy', inspect);
                }
                return execArgv;
            },
            createEnv: (initialEnv = process.env) => createIpcEnv(initialEnv)
        };
    }

    /**
     * @returns a string like `--inspect=port` or `undefined`.
     */
    protected getInspectFlag(name: string, argv: string[]): string | undefined {
        const prefix = `--${name}-inspect`;
        const found = argv.find(arg => arg.startsWith(prefix));
        if (found) {
            return '--inspect' + found.substring(prefix.length);
        }
    }

    protected createLogger(name: string, server: ChildProcess): Logger {
        return {
            error: message => console.error(`[${name}: ${server.pid}]`, message),
            info: message => console.info(`[${name}: ${server.pid}]`, message),
            log: message => console.log(`[${name}: ${server.pid}]`, message),
            warn: message => console.warn(`[${name}: ${server.pid}]`, message),
        };
    }
}
