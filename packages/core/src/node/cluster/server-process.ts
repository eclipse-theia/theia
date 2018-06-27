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
import * as http from 'http';
import * as https from 'https';
import * as cluster from 'cluster';
import { injectable, inject } from "inversify";
import { createRemoteMaster, IMasterProcess, IServerProcess } from './cluster-protocol';
import { BackendApplicationContribution } from '../backend-application';

export const RemoteMasterProcessFactory = Symbol('RemoteMasterProcessFactory');
export type RemoteMasterProcessFactory = (serverProcess: IServerProcess) => IMasterProcess;
export const stubRemoteMasterProcessFactory: RemoteMasterProcessFactory = serverProcess => {
    let ready = false;
    return {
        onDidInitialize: () => {
            ready = true;
        },
        restart: async () => {
            if (!ready) {
                throw new Error('onDidInitialize has not been called yet');
            }
        }
    };
};
export const clusterRemoteMasterProcessFactory: RemoteMasterProcessFactory = serverProcess =>
    cluster.isWorker ? createRemoteMaster(cluster.worker, serverProcess) : stubRemoteMasterProcessFactory(serverProcess);

@injectable()
export class ServerProcess implements BackendApplicationContribution {

    protected readonly master: IMasterProcess;
    protected server: http.Server | https.Server | undefined;
    protected readonly sockets = new Set<net.Socket>();

    constructor(
        @inject(RemoteMasterProcessFactory) protected readonly masterFactory: RemoteMasterProcessFactory
    ) {
        this.master = this.masterFactory({});
        this.master.onDidInitialize();
    }

    onStart(server: http.Server | https.Server): void {
        this.server = server;
        server.on('connection', socket => {
            this.sockets.add(socket);
            socket.on('close', () => this.sockets.delete(socket));
        });
    }

    restart(): Promise<void> {
        return this.master.restart();
    }

    async kill(): Promise<void> {
        if (cluster.isWorker) {
            await this.close();
            await this.disconnect();
            cluster.worker.kill();
        }
    }

    protected close(): Promise<void> {
        const server = this.server;
        if (server) {
            return new Promise(resolve => {
                server.close(() => {
                    for (const socket of this.sockets) {
                        socket.destroy();
                    }
                    resolve();
                });
            });
        }
        return Promise.resolve();
    }

    protected disconnect(): Promise<void> {
        const worker = cluster.worker;
        if (worker.isConnected) {
            const disconnect = new Promise<void>(resolve => worker.once('disconnect', resolve));
            worker.disconnect();
            return disconnect;
        }
        return Promise.resolve();
    }

}
