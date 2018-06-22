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

import * as cluster from 'cluster';
import { createIpcEnv } from '../messaging/ipc-protocol';
import { RemoteServer, createRemoteServer } from './cluster-protocol';

export class ServerWorker {

    protected readonly worker: cluster.Worker;

    readonly server: RemoteServer;
    readonly online: Promise<void>;
    readonly failed: Promise<Error>;
    readonly listening: Promise<cluster.Address>;
    readonly initialized: Promise<void>;
    readonly disconnect: Promise<void>;
    readonly exit: Promise<number>;

    constructor(restart: () => Promise<void>) {
        let onDidInitialize: () => void = () => { };
        this.initialized = new Promise<void>(resolve => onDidInitialize = resolve);

        console.log('Starting server worker...');
        this.worker = cluster.fork(createIpcEnv({
            env: process.env
        }));
        this.server = createRemoteServer(this.worker, { onDidInitialize, restart });

        this.online = new Promise(resolve => this.worker.once('online', resolve));
        this.failed = new Promise(resolve => this.worker.once('error', resolve));
        this.listening = new Promise(resolve => this.worker.once('listening', resolve));
        this.disconnect = new Promise(resolve => this.worker.once('disconnect', resolve));
        this.exit = new Promise(resolve => this.worker.once('exit', resolve));

        const workerIdentifier = `[ID: ${this.worker.id} | PID: ${this.worker.process.pid}]`;
        this.online.then(() => console.log(`Server worker has been started. ${workerIdentifier}`));
        this.failed.then(error => console.error(`Server worker failed. ${workerIdentifier}`, error));
        this.initialized.then(() => console.log(`Server worker is ready to accept messages. ${workerIdentifier}`));
        this.disconnect.then(() => console.log(`Server worker has been disconnected. ${workerIdentifier}`));
        this.exit.then(() => console.log(`Server worker has been stopped. ${workerIdentifier}`));
    }

    async stop(): Promise<void> {
        if (this.worker.isConnected) {
            this.worker.disconnect();
            await this.disconnect;
        }
        if (!this.worker.isDead) {
            this.worker.kill();
            await this.exit;
        }
    }

}
