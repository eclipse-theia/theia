/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
