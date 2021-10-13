/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import { isWindows } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import * as cp from 'child_process';
import { OsProcessServer } from '../common/os-process-protocol';

@injectable()
export class OsProcessServerImpl implements OsProcessServer {

    async hasChildProcesses(pid: number): Promise<boolean> {
        if (isWindows) {
            return this.spawnAsPromised('wmic', ['process', 'get', 'ParentProcessId']).then(
                stdout => {
                    const pids = stdout.split('\r\n');
                    return pids.some(p => parseInt(p) === pid);
                },
                error => true
            );
        } else {
            return this.spawnAsPromised('/usr/bin/pgrep', ['-lP', String(pid)]).then(
                stdout => {
                    stdout = stdout.trim();
                    if (stdout.length === 0 || stdout.indexOf(' tmux') >= 0) { // ignore tmux
                        return false;
                    } else {
                        return true;
                    }
                },
                error => true
            );
        }
    }

    /**
     * Copied and modified from https://github.com/microsoft/vscode/blob/4636be2b71c87bfb0bfe3c94278b447a5efcc1f1/src/vs/workbench/contrib/debug/node/terminals.ts#L32-L75
     */
    protected spawnAsPromised(command: string, args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            let stdout = '';
            const child = cp.spawn(command, args);
            if (child.pid) {
                child.stdout.on('data', (data: Buffer) => {
                    stdout += data.toString();
                });
            }
            child.on('error', err => {
                reject(err);
            });
            child.on('close', code => {
                resolve(stdout);
            });
        });
    }
}
