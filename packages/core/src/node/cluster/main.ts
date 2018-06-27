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

import * as cluster from 'cluster';
import { checkParentAlive } from '../messaging/ipc-protocol';
import { MasterProcess } from './master-process';

checkParentAlive();

process.on('unhandledRejection', (reason, promise) => {
    throw reason;
});

const args = require('yargs').help(false).argv;
const noCluster = args['cluster'] === false;
const isMaster = !noCluster && cluster.isMaster;
const development = process.env.NODE_ENV === "development";

if (isMaster && development) {
    // https://github.com/Microsoft/vscode/issues/3201
    process.execArgv = process.execArgv.reduce((result, arg) => {
        result.push(arg.replace('-brk', ''));
        return result;
    }, [] as string[]);
}

export interface Address {
    port: number;
    address: string;
}

export async function start(serverPath: string): Promise<Address> {
    if (isMaster) {
        const master = new MasterProcess();
        master.onexit(process.exit);
        try {
            const worker = await master.start();
            return worker.listening;
        } catch (error) {
            process.exit(error.returnCode);
        }
    }
    const server = await require(serverPath)();
    return server.address();
}
export default start;
