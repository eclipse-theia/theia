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

import 'reflect-metadata';
import { clusterRemoteMasterProcessFactory, ServerProcess } from '../cluster';

const jobs: { [id: string]: (() => Promise<void>) | undefined } = {
    restart: async () => {
        const server = new ServerProcess(clusterRemoteMasterProcessFactory);
        let firstRestartFailed = true;
        try {
            await server.restart();
            firstRestartFailed = false;
        } catch (error) {
            if (!/failed to start/.test(error.message)) {
                throw error;
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
