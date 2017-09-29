/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
// tslint:disable:no-console

import * as cluster from 'cluster';
import { RemoteServer, createRemoteServer } from './cluster-protocol';

export class ServerWorker {

    protected readonly worker: cluster.Worker;

    readonly server: RemoteServer;
    readonly online: Promise<void>;
    readonly failed: Promise<Error>;
    readonly listening: Promise<cluster.Address>;
    readonly initialized: Promise<void>;
    readonly disconnect: Promise<void>;
    readonly exit: Promise<string>;

    constructor(restart: () => Promise<void>) {
        let onDidInitialize: () => void = () => { };
        this.initialized = new Promise<void>(resolve => onDidInitialize = resolve);

        console.log('Starting the express server worker...');
        this.worker = cluster.fork();
        this.server = createRemoteServer(this.worker, { onDidInitialize, restart });

        this.online = new Promise(resolve => this.worker.once('online', resolve));
        this.failed = new Promise(resolve => this.worker.once('error', resolve));
        this.listening = new Promise(resolve => this.worker.once('listening', resolve));
        this.disconnect = new Promise(resolve => this.worker.once('disconnect', resolve));
        this.exit = new Promise(resolve => this.worker.once('exit', resolve));

        this.online.then(() => console.log(`The express server worker ${this.worker.id} has been started.`));
        this.failed.then(error => console.error(`The express server worker ${this.worker.id} failed:`, error));
        this.initialized.then(() => console.log(`The express server worker ${this.worker.id} is ready to accept messages.`));
        this.disconnect.then(() => console.log(`The express server worker ${this.worker.id} has been disconnected.`));
        this.exit.then(() => console.log(`The express server worker ${this.worker.id} has been stopped.`));
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
