/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';
import * as cluster from 'cluster';
import { MasterProcess } from './cluster/master-process';

process.on('unhandledRejection', (reason, promise) => {
    throw reason;
});

describe('master-process', () => {

    function prepareTestWorker(job: string) {
        const testSettings: cluster.ClusterSettings = {
            exec: path.resolve(__dirname, '../../lib/node/test/cluster-test-worker.js'),
            execArgv: [],
            args: [job],
            stdio: ['ipc', 1, 2]
        };
        cluster.setupMaster(testSettings);
    }

    let originalSettings: cluster.ClusterSettings;
    beforeEach(() => originalSettings = cluster.settings);
    afterEach(() => cluster.setupMaster(originalSettings));

    /**
     * Tests restarting of workers by the master process:
     * 1. the master process starts the server worker with `restart` job
     * 2. Testing failed restart
     *   2.1 the first worker sends `restart` request to the master
     *   2.2 the master tries to start the second worker with `timeout next worker` job
     *   2.3 the second worker fails because such job does not exist
     *   2.4 the master throws the error to the first worker
     *   2.5 the first worker checks that the error is received
     * 3. Testing successful restart
     *   3.1 the first worker sends `restart` request again to the master
     *   3.2 the master tries to start the third worker with `restarted` job
     *   3.3 the third worker is successfully initialized and then exits
     *   3.4 the master worker returns to the first worker
     *   3.5 the first worker exits
     */
    it('start', async function () {
        this.timeout(10000);
        const master = new MasterProcess();

        prepareTestWorker('restart');
        const restartWorker = master.start();

        prepareTestWorker('timeout next worker');
        await master.restarting;
        prepareTestWorker('restarted');

        const restartedWorker = await master.restarted;
        await restartWorker.exit;
        await restartedWorker.exit;
    });

});
