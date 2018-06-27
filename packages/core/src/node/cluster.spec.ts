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
        const restartWorker = await master.start();

        prepareTestWorker('timeout next worker');
        await master.restarting;
        prepareTestWorker('restarted');

        const restartedWorker = await master.restarted;
        await restartWorker.exit;
        await restartedWorker.exit;
    });

});
