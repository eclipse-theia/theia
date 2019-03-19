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
import { Process, ProcessType, ProcessOptions, ForkOptions, ProcessErrorEvent } from './process';
import { ChildProcess, spawn, fork } from 'child_process';
import * as stream from 'stream';

// The class was here before, exporting to not break anything.
export { DevNullStream } from './dev-null-stream';
import { DevNullStream } from './dev-null-stream';

export const RawProcessOptions = Symbol('RawProcessOptions');

/**
 * Options to spawn a new process (`spawn`).
 *
 * For more information please refer to the spawn function of Node's
 * child_process module:
 *
 *   https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options
 */
export interface RawProcessOptions extends ProcessOptions {
}

/**
 * Options to fork a new process using the current Node interpreter (`fork`).
 *
 * For more information please refer to the fork function of Node's
 * `child_process` module:
 *
 *   https://nodejs.org/api/child_process.html#child_process_child_process_fork_modulepath_args_options
 */
export interface RawForkOptions extends ForkOptions {
}

export const RawProcessFactory = Symbol('RawProcessFactory');
export interface RawProcessFactory {
    (options: RawProcessOptions | RawForkOptions): RawProcess;
}

@injectable()
export class RawProcess extends Process {

    /**
     * @deprecated use `inputStream` instead.
     */
    get input(): stream.Writable { return this.inputStream; }

    /**
     * @deprecated use `outputStream` instead.
     */
    get output(): stream.Readable { return this.outputStream; }

    /**
     * @deprecated use `errorStream` instead.
     */
    get errorOutput(): stream.Readable { return this.errorStream; }

    /**
     * If the process fails to launch, it will be undefined.
     */
    readonly process: ChildProcess | undefined;

    readonly outputStream: stream.Readable;
    readonly errorStream: stream.Readable;
    readonly inputStream: stream.Writable;

    constructor(
        @inject(RawProcessOptions) options: RawProcessOptions | RawForkOptions,
        @inject(ProcessManager) processManager: ProcessManager,
        @inject(ILogger) @named('process') logger: ILogger
    ) {
        super(processManager, logger, ProcessType.Raw, options);
        const executable = this.isForkOptions(options) ? options.modulePath : options.command;

        this.logger.debug(`Starting raw process: ${executable},`
            + ` with args: ${options.args ? options.args.join(' ') : ''}, `
            + ` with options: ${JSON.stringify(options.options)}`);

        // About catching errors: spawn will sometimes throw directly
        // (EACCES on Linux), sometimes return a Process object with the pid
        // property undefined (ENOENT on Linux) and then emit an 'error' event.
        // For now, we try to normalize that into always emitting an 'error'
        // event.
        try {
            if (this.isForkOptions(options)) {
                this.process = fork(
                    options.modulePath,
                    options.args,
                    options.options);
            } else {
                this.process = spawn(
                    options.command,
                    options.args,
                    options.options);
            }

            this.process.on('error', (error: NodeJS.ErrnoException) => {
                error.code = error.code || 'Unknown error';
                this.emitOnError(error as ProcessErrorEvent);
            });
            this.process.on('exit', (exitCode: number, signal: string) => {
                // node's child_process exit sets the unused parameter to null,
                // but we want it to be undefined instead.
                this.emitOnExit(
                    exitCode !== null ? exitCode : undefined,
                    signal !== null ? signal : undefined,
                );
            });

            this.outputStream = this.process.stdout || new DevNullStream();
            this.inputStream = this.process.stdin || new DevNullStream();
            this.errorStream = this.process.stderr || new DevNullStream();

            if (this.process.pid !== undefined) {
                process.nextTick(this.emitOnStarted.bind(this));
            }
        } catch (error) {
            /* When an error is thrown, set up some fake streams, so the client
               code doesn't break because these field are undefined.  */
            this.outputStream = new DevNullStream();
            this.inputStream = new DevNullStream();
            this.errorStream = new DevNullStream();

            /* Call the client error handler, but first give them a chance to register it.  */
            this.emitOnErrorAsync(error);
        }
    }

    get pid() {
        if (!this.process) {
            throw new Error('process did not start correctly');
        }
        return this.process.pid;
    }

    kill(signal?: string) {
        if (this.process && this.killed === false) {
            this.process.kill(signal);
        }
    }

}
