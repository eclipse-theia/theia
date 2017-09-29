/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

// tslint:disable:no-console
import { assert, use } from 'chai';
use(require('chai-as-promised'));
import * as cluster from 'cluster';
import { clusterRemoteMasterProcessFactory, ServerProcess } from './cluster';
import { MasterProcess } from './cluster/master-process';

process.on('unhandledRejection', (reason, promise) => {
    throw reason;
});

if (cluster.isMaster) {
    describe('master-process', () => {

        function prepareWorkerTest(test: string) {
            // https://github.com/Microsoft/vscode/issues/3201
            const execArgv = process.execArgv.reduce((result, arg) => {
                result.push(arg.replace('-brk', ''));
                return result;
            }, [] as string[]);
            const testSettings: cluster.ClusterSettings = {
                execArgv,
                args: [...process.argv.slice(2), '--grep', test],
                // https://github.com/Microsoft/vscode/issues/19750
                stdio: ['ipc', 'pipe', 'pipe']
            };
            cluster.setupMaster(testSettings);
        }

        const forwardWorkerTestOutput = (worker: cluster.Worker) => {
            worker.process.stdout.pipe(process.stdout);
            worker.process.stderr.pipe(process.stderr);
        };
        before(() => {
            cluster.on('fork', forwardWorkerTestOutput);
        });
        after(() => {
            cluster.removeListener('fork', forwardWorkerTestOutput);
        });

        let originalSettings: cluster.ClusterSettings;
        beforeEach(() => originalSettings = cluster.settings);
        afterEach(() => cluster.setupMaster(originalSettings));

        it('start', async function () {
            this.timeout(10000);
            const master = new MasterProcess();

            prepareWorkerTest('restart');
            const restartWorker = master.start();

            prepareWorkerTest('timeout next worker');
            await master.restarting;
            prepareWorkerTest('restarted');

            const restartedWorker = await master.restarted;
            await assert.isFulfilled(restartWorker.exit);
            await assert.isFulfilled(restartedWorker.exit);
        });

    });
} else {
    describe('server-process', () => {

        it('restart', async function () {
            const server = new ServerProcess(clusterRemoteMasterProcessFactory);
            await assert.isRejected(server.restart());
            await assert.isFulfilled(server.restart());
        });

        it('restarted', async function () {
            const server = new ServerProcess(clusterRemoteMasterProcessFactory);
            await assert.isFulfilled(server.kill());
        });

    });
}
