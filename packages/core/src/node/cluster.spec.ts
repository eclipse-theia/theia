/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

// tslint:disable:no-console
import * as assert from 'assert';
import * as cluster from 'cluster';
import { clusterRemoteMasterProcessFactory, ServerProcess } from './cluster';
import { MasterProcess } from './cluster/master-process';

if (cluster.isMaster) {
    describe('master-process', () => {

        function setupMaster(test: string) {
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

        let originalSettings: cluster.ClusterSettings;
        beforeEach(() => originalSettings = cluster.settings);
        afterEach(() => cluster.setupMaster(originalSettings));

        it('start', async function () {
            this.timeout(10000);
            let workers: number = 0;
            let expectedWorkers = 2;
            cluster.on('fork', worker => {
                worker.process.stdout.on('data', chunk => {
                    const value = chunk.toString();
                    if (!!value.trim()) {
                        console.log(chunk.toString());
                    }
                });
                worker.process.stderr.on('data', chunk => {
                    const value = chunk.toString();
                    if (!!value.trim()) {
                        console.error(chunk.toString());
                    }
                });
            });
            cluster.on('online', worker => {
                workers++;
            });
            const waitForWorkers = new Promise(resolve => {
                cluster.on('exit', worker => {
                    workers--;
                    if (workers === 0) {
                        expectedWorkers--;
                        if (expectedWorkers === 0) {
                            resolve();
                        }
                    }
                });
            });
            const master = new MasterProcess();
            setupMaster('restart');
            master.start();
            setupMaster('onDidRestart');
            await waitForWorkers;
        });

    });
} else {
    describe('server-process', () => {

        it('restart', function () {
            const waitForRestart = new Promise(resolve => {
                cluster.worker.on('disconnect', () => {
                    assert.equal(true, cluster.worker.exitedAfterDisconnect, 'The worker should be stopped by the master.');
                    resolve();
                });
            });

            const server = new ServerProcess(clusterRemoteMasterProcessFactory);
            server.restart();
            return waitForRestart;
        });

        it('onDidRestart', function () {
            const server = new ServerProcess(clusterRemoteMasterProcessFactory);
            return server.restarted;
        });

    });
}
