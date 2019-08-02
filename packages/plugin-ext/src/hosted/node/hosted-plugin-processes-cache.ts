/********************************************************************************
 * Copyright (c) 2019 SAP SE or an SAP affiliate company and others.
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

import { injectable } from 'inversify';
import * as cp from 'child_process';
import { HostedPluginProcess } from './hosted-plugin-process';
import { HostedPluginClient } from '../../common/plugin-protocol';

const DEF_MIN_KEEP_ALIVE_DISCONNECT_TIME = 5 * 1000; // 5 seconds

@injectable()
export class HostedPluginProcessesCache {

    // child processes are kept for one minute in order to reuse them in case of network disconnections
    private cachedCPMap: Map<number, { cp: cp.ChildProcess, toBeKilledAfter: number } > = new Map();

    // client ids sequence
    private clientIdSeq = 1;

    private minKeepAliveDisconnectTime: number = process.env.THEIA_PLUGIN_HOST_MIN_KEEP_ALIVE ?
        parseInt(process.env.THEIA_PLUGIN_HOST_MIN_KEEP_ALIVE) : DEF_MIN_KEEP_ALIVE_DISCONNECT_TIME;

    public async getLazyClientId(client: HostedPluginClient): Promise<number> {
        let clientId = await client.getClientId();
        if (clientId && clientId <= this.clientIdSeq) {
            return clientId;
        }
        clientId = this.clientIdSeq++;
        await client.setClientId(clientId);
        return clientId;
    }

    public linkLiveClientAndProcess(clientId: number, childProcess: cp.ChildProcess): void {
        this.cachedCPMap.set(clientId, {
            cp: childProcess,
            toBeKilledAfter: Infinity
        });
    }

    public retrieveClientChildProcess(clientID: number): cp.ChildProcess | undefined {
        const childProcessDatum = this.cachedCPMap.get(clientID);
        return childProcessDatum && childProcessDatum.cp;
    }

    public scheduleChildProcessTermination(hostedPluginProcess: HostedPluginProcess, childProcess: cp.ChildProcess): void {
        for (const cachedChildProcessesDatum of this.cachedCPMap.values()) {
            if (cachedChildProcessesDatum.cp === childProcess) {
                cachedChildProcessesDatum.toBeKilledAfter = new Date().getTime() + this.minKeepAliveDisconnectTime;
            }
        }
        setTimeout(() => {
            this.cachedCPMap.forEach((cachedChildProcessesDatum, clientId) => {
                if (cachedChildProcessesDatum.cp === childProcess && cachedChildProcessesDatum.toBeKilledAfter < new Date().getTime()) {
                    this.cachedCPMap.delete(clientId);
                    hostedPluginProcess.terminatePluginServer();
                }
            });
        }, this.minKeepAliveDisconnectTime * 2);
    }
}
