/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { EventEmitter } from 'events';
import { ServerWorker } from './server-worker';

export type MasterProcessEvent = 'started' | 'restarted' | 'restarting';
export class MasterProcess extends EventEmitter {

    protected serverWorker: ServerWorker | undefined;

    protected fork(): ServerWorker {
        return new ServerWorker(() => this.restart());
    }

    start(): ServerWorker {
        if (this.serverWorker) {
            throw new Error('Server worker is already running.');
        }
        this.serverWorker = this.fork();
        this.emit('started', this.serverWorker);
        return this.serverWorker;
    }
    get started(): Promise<ServerWorker> {
        return new Promise(resolve => this.on('started', resolve));
    }

    async restart(): Promise<void> {
        if (!this.serverWorker) {
            throw new Error('Server worker is not running.');
        }
        this.emit('restarting', this.serverWorker);
        console.log(`Restarting the server worker is requested.`);
        const serverWorker = this.fork();
        const success = serverWorker.initialized.then(() => true);

        const failure = Promise.race(
            [serverWorker.failed, serverWorker.disconnect, serverWorker.exit, this.timeout(5000)]
        ).then(() => false);
        const restarted = await Promise.race([success, failure]);
        if (!restarted) {
            serverWorker.stop();
            const message = `Server worker failed to restart.`;
            console.error(message);
            throw new Error(message);
        }
        this.serverWorker = serverWorker;
        console.log(`Server worker has been restarted.`);
        this.emit('restarted', this.serverWorker);
    }
    get restarting(): Promise<ServerWorker> {
        return new Promise(resolve => this.on('restarting', resolve));
    }
    get restarted(): Promise<ServerWorker> {
        return new Promise(resolve => this.on('restarted', resolve));
    }

    protected timeout(delay: number): Promise<void> {
        let resolveTimeout: () => void;
        const timeout = new Promise<void>(resolve => resolveTimeout = resolve);
        setTimeout(() => resolveTimeout(), delay);
        return timeout;
    }

    on(event: MasterProcessEvent, listener: (worker: ServerWorker) => void): this {
        return super.on(event, listener);
    }
    emit(event: MasterProcessEvent, worker: ServerWorker): boolean {
        return super.emit(event, worker);
    }

}
