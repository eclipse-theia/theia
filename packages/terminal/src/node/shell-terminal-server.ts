/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { IShellTerminalServerOptions } from '../common/shell-terminal-protocol';
import { BaseTerminalServer } from './base-terminal-server';
import { mergeProcessEnv, ShellProcessFactory } from './shell-process';
import { ProcessManager } from '@theia/process/lib/node';
import { isWindows } from '@theia/core/lib/common/os';
import * as cp from 'child_process';

@injectable()
export class ShellTerminalServer extends BaseTerminalServer {

    constructor(
        @inject(ShellProcessFactory) protected readonly shellFactory: ShellProcessFactory,
        @inject(ProcessManager) processManager: ProcessManager,
        @inject(ILogger) @named('terminal') logger: ILogger) {
        super(processManager, logger);
    }

    async create(options: IShellTerminalServerOptions): Promise<number> {
        try {
            options.env = this.mergeProcessEnv(options.env);
            this.mergedCollection.applyToProcessEnvironment(options.env);
            const term = this.shellFactory(options);
            this.postCreate(term);
            return term.id;
        } catch (error) {
            this.logger.error('Error while creating terminal', error);
            return -1;
        }
    }

    /**
     * Empty string values will be removed from the final env.
     *
     * @param env desired environment to merge with `process.env`.
     */
    protected mergeProcessEnv(env: Record<string, string | null> = {}): Record<string, string> {
        return mergeProcessEnv(env);
    }

    // copied and modified from https://github.com/microsoft/vscode/blob/4636be2b71c87bfb0bfe3c94278b447a5efcc1f1/src/vs/workbench/contrib/debug/node/terminals.ts#L32-L75
    private spawnAsPromised(command: string, args: string[]): Promise<string> {
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

    public hasChildProcesses(processId: number | undefined): Promise<boolean> {
        if (processId) {
            // if shell has at least one child process, assume that shell is busy
            if (isWindows) {
                return this.spawnAsPromised('wmic', ['process', 'get', 'ParentProcessId']).then(stdout => {
                    const pids = stdout.split('\r\n');
                    return pids.some(p => parseInt(p) === processId);
                }, error => true);
            } else {
                return this.spawnAsPromised('/usr/bin/pgrep', ['-lP', String(processId)]).then(stdout => {
                    const r = stdout.trim();
                    if (r.length === 0 || r.indexOf(' tmux') >= 0) { // ignore 'tmux';
                        return false;
                    } else {
                        return true;
                    }
                }, error => true);
            }
        }
        // fall back to safe side
        return Promise.resolve(true);
    }
}
