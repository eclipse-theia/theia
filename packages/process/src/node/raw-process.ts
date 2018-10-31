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

import { injectable, inject, named } from 'inversify';
import { ProcessManager } from './process-manager';
import { ILogger } from '@theia/core/lib/common';
import { Process, ProcessType, ProcessOptions } from './process';
import { ChildProcess, spawn } from 'child_process';

export const RawProcessOptions = Symbol('RawProcessOptions');
export interface RawProcessOptions extends ProcessOptions {
}

export const RawProcessFactory = Symbol('RawProcessFactory');
export interface RawProcessFactory {
    create(options: RawProcessOptions): Promise<RawProcess>;
}

@injectable()
export class RawProcessFactoryImpl implements RawProcessFactory {

    @inject(ProcessManager)
    processManager: ProcessManager;

    @inject(ILogger) @named('process')
    logger: ILogger;

    create(options: RawProcessOptions): Promise<RawProcess> {
        return new Promise<RawProcess>((resolve, reject) => {
            this.logger.debug(`Starting raw process: ${options.command},`
                + ` with args: ${options.args ? options.args.join(' ') : ''}, `
                + ` with options: ${JSON.stringify(options.options)}`);

            // About catching errors: spawn will sometimes throw directly
            // (EACCES on Linux), sometimes return a Process object with the pid
            // property undefined (ENOENT on Linux).  In the latter case, wait
            // for the error event to reject the Promise.
            const process: ChildProcess = spawn(options.command, options.args, options.options);
            if (process.pid === undefined) {
                process.on('error', (err: Error) => {
                    reject(err);
                });
            } else {
                const rawProcess = new RawProcess(process, this.logger);
                this.processManager.register(rawProcess);
                resolve(rawProcess);
            }
        });
    }
}

export class RawProcess extends Process {

    constructor(readonly process: ChildProcess, logger: ILogger) {
        super(logger, ProcessType.Raw);

        this.process.on('exit', this.emitOnExit.bind(this));
    }

    get pid() {
        return this.process.pid;
    }

    get stdin() {
        return this.process.stdin;
    }

    get stdout() {
        return this.process.stdout;
    }

    get stderr() {
        return this.process.stderr;
    }

    kill(signal?: string) {
        if (this.killed === false) {
            this.process.kill(signal);
        }
    }

}
