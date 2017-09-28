/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as net from 'net';
import * as http from 'http';
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
            if (ready) {
                serverProcess.onDidRestart();
            }
        }
    };
};
export const clusterRemoteMasterProcessFactory: RemoteMasterProcessFactory = serverProcess =>
    cluster.isWorker ? createRemoteMaster(cluster.worker, serverProcess) : stubRemoteMasterProcessFactory(serverProcess);

@injectable()
export class ServerProcess implements BackendApplicationContribution {

    protected readonly master: IMasterProcess;
    protected server: http.Server | undefined;
    protected readonly sockets = new Set<net.Socket>();
    protected resolveRestarted: () => void;
    readonly restarted = new Promise<void>(resolve => this.resolveRestarted = resolve);

    constructor(
        @inject(RemoteMasterProcessFactory) protected readonly masterFactory: RemoteMasterProcessFactory
    ) {
        this.master = this.masterFactory({
            onDidRestart: this.resolveRestarted,
        });
        this.master.onDidInitialize();
    }

    restart(): void {
        if (cluster.isWorker) {
            if (this.server) {
                this.server.close(() => {
                    for (const socket of this.sockets) {
                        socket.destroy();
                    }
                });
            }
            this.master.restart();
        }
    }

    onStart(server: http.Server): void {
        this.server = server;
        server.on('connection', socket => {
            this.sockets.add(socket);
            socket.on('close', () => this.sockets.delete(socket));
        });
    }
}
