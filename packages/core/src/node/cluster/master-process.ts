/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as cluster from 'cluster';
import { IMasterProcess, RemoteServer, createRemoteServer } from './cluster-protocol';

// tslint:disable:no-console
export class MasterProcess implements IMasterProcess {

    protected state: {
        worker: cluster.Worker,
        server: RemoteServer,
        initialized: Promise<void>,
        resolveInitialized: () => void,
        rejectInitialized: (reason: Error) => void
    } | undefined = undefined;

    start(): Promise<void> {
        if (this.state) {
            throw new Error('The express server worker is already running.');
        }
        console.log('Starting the express server worker...');
        const worker = cluster.fork();
        const server = createRemoteServer(worker, this);
        let resolveInitialized: () => void = () => { };
        let rejectInitialized: () => void = () => { };
        const initialized = new Promise<void>((resolve, reject) => {
            resolveInitialized = resolve;
            rejectInitialized = reject;
        }).then(() => console.log(`The express server worker ${worker.id} is ready to accept messages.`),
            reason => console.error(reason));
        this.state = { worker, server, resolveInitialized, rejectInitialized, initialized };
        return new Promise(resolve =>
            worker.once('online', resolve)
        ).then(() => console.log(`The express server worker ${worker.id} has been started.`));
    }

    async stop(): Promise<void> {
        if (!this.state) {
            throw this.noRunningError;
        }
        this.state.rejectInitialized(new Error('The express server worker is going to be killed.'));
        const worker = this.state.worker;
        this.state = undefined;
        console.log(`Stopping the express server worker ${worker.id}...`);
        if (worker.isConnected()) {
            console.log(`Disconnecting the express server worker ${worker.id}...`);
            worker.disconnect();
            await new Promise<void>(resolve =>
                worker.once('disconnect', resolve)
            );
            console.log(`The express server worker ${worker.id} has been disconnected.`);
        }
        if (!worker.isDead()) {
            console.log(`Killing the express server worker ${worker.id}...`);
            worker.kill();
            await new Promise<void>(resolve =>
                worker.once('exit', resolve)
            );
            console.log(`The express server worker ${worker.id} has been killed.`);
        }
        console.log(`The express server worker ${worker.id} has been stopped.`);
    }

    protected get noRunningError(): Error {
        return new Error('The express server worker is not running.');
    }

    onDidInitialize(): void {
        if (this.state) {
            this.state.resolveInitialized();
        }
    }

    async restart(): Promise<void> {
        console.log(`Restarting the express server worker is requsted.`);
        await this.stop();
        await this.start();
        const state = this.state;
        if (state) {
            await state.initialized;
            const server = state.server;
            server.onDidRestart();
            console.log(`The express server worker has been restarted.`);
        }
    }

}
