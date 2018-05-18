/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { EventEmitter } from 'events';
import { ServerWorker } from './server-worker';

class ProcessError extends Error {
    returnCode: number = 1;
}

export type MasterProcessEvent = 'started' | 'restarted' | 'restarting';
export class MasterProcess extends EventEmitter {

    protected serverWorker: ServerWorker | undefined;
    protected workerCount: number = 0;

    protected async fork(): Promise<ServerWorker> {
        const worker = new ServerWorker(() => this.restart());
        const success = worker.initialized.then(() => true);

        const failure = Promise.race(
            [worker.failed, worker.disconnect, worker.exit, this.timeout(5000)]
        ).then(() => false);
        const started = await Promise.race([success, failure]);

        // Failure
        if (!started) {
            const error = new ProcessError(`Server worker failed to start.`);
            console.error(error.message);

            worker.stop();
            error.returnCode = await worker.exit;
            throw error;
        }

        // Success
        this.workerCount++;
        worker.exit.then(code => {
            if (--this.workerCount === 0) {
                super.emit('exit', code);
            }
        });
        return worker;
    }

    async start(): Promise<ServerWorker> {
        if (this.serverWorker) {
            throw new Error('Server worker is already running.');
        }
        this.serverWorker = await this.fork();
        this.emit('started', this.serverWorker);
        return this.serverWorker;
    }
    get started(): Promise<ServerWorker> {
        return new Promise(resolve => this.once('started', resolve));
    }

    async restart(): Promise<void> {
        if (!this.serverWorker) {
            throw new Error('Server worker is not running.');
        }
        this.emit('restarting', this.serverWorker);
        console.log(`Restarting the server worker is requested.`);

        // Will throw if a problem is encountered at startup
        const newServerWorker = await this.fork();

        this.serverWorker = newServerWorker;
        console.log(`Server worker has been restarted.`);
        this.emit('restarted', this.serverWorker);
    }
    get restarting(): Promise<ServerWorker> {
        return new Promise(resolve => this.once('restarting', resolve));
    }
    get restarted(): Promise<ServerWorker> {
        return new Promise(resolve => this.once('restarted', resolve));
    }

    protected timeout(delay: number): Promise<void> {
        let resolveTimeout: () => void;
        const timeout = new Promise<void>(resolve => resolveTimeout = resolve);
        setTimeout(() => resolveTimeout(), delay);
        return timeout;
    }

    onexit(listener: (code: number) => void): this {
        return super.on('exit', listener);
    }

    on(event: MasterProcessEvent, listener: (worker: ServerWorker) => void): this {
        return super.on(event, listener);
    }
    emit(event: MasterProcessEvent, worker: ServerWorker): boolean {
        return super.emit(event, worker);
    }

}
