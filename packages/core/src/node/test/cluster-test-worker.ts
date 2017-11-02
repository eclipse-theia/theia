/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

// tslint:disable:no-console
import 'reflect-metadata';
import { clusterRemoteMasterProcessFactory, ServerProcess } from '../cluster';

const jobs: { [id: string]: (() => Promise<void>) | undefined } = {
    restart: async () => {
        const server = new ServerProcess(clusterRemoteMasterProcessFactory);
        let firstRestartFailed = true;
        try {
            await server.restart();
            firstRestartFailed = false;
        } catch (e) {
            if ((e as Error).message.indexOf('failed to restart') === -1) {
                throw e;
            }
        }
        if (firstRestartFailed) {
            await server.restart();
        } else {
            throw new Error('first restart should fail');
        }
    },
    restarted: async () => {
        const server = new ServerProcess(clusterRemoteMasterProcessFactory);
        await server.kill();
    }
};

const id = process.argv[process.argv.length - 1];
const job = jobs[id];
if (job) {
    job().then(() =>
        process.exit(0),
        reason => {
            console.error(`Test worker: '${id}' failed`, reason);
            process.exit(1);
        }
    );
}
