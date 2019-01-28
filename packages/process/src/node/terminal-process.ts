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
import { ILogger } from '@theia/core/lib/common';
import { Process, ProcessType, ProcessOptions } from './process';
import { ProcessManager } from './process-manager';
import { IPty, spawn } from '@theia/node-pty';
import { MultiRingBuffer, MultiRingBufferReadableStream } from './multi-ring-buffer';
import { signame } from './utils';

export const TerminalProcessOptions = Symbol('TerminalProcessOptions');
export interface TerminalProcessOptions extends ProcessOptions {
}

export const TerminalProcessFactory = Symbol('TerminalProcessFactory');
export interface TerminalProcessFactory {
    (options: TerminalProcessOptions): TerminalProcess;
}

@injectable()
export class TerminalProcess extends Process {

    protected readonly terminal: IPty;

    constructor(
        @inject(TerminalProcessOptions) options: TerminalProcessOptions,
        @inject(ProcessManager) processManager: ProcessManager,
        @inject(MultiRingBuffer) protected readonly ringBuffer: MultiRingBuffer,
        @inject(ILogger) @named('process') logger: ILogger
    ) {
        super(processManager, logger, ProcessType.Terminal, options);

        this.logger.debug('Starting terminal process', JSON.stringify(options, undefined, 2));

        try {
            this.terminal = spawn(
                options.command,
                options.args || [],
                options.options || {});

            this.terminal.on('exec', (reason: string | undefined) => {
                if (reason === undefined) {
                    this.emitOnStarted();
                } else {
                    this.emitOnError({ code: reason });
                }
            });

            this.terminal.on('exit', (code: number, signal?: number) => {
                // Make sure to only pass either code or signal as !undefined, not
                // both.
                //
                // node-pty quirk: On Linux/macOS, if the process exited through the
                // exit syscall (with an exit code), signal will be 0 (an invalid
                // signal value).  If it was terminated because of a signal, the
                // signal parameter will hold the signal number and code should
                // be ignored.
                if (signal === undefined || signal === 0) {
                    this.emitOnExit(code, undefined);
                } else {
                    this.emitOnExit(undefined, signame(signal));
                }
            });

            this.terminal.on('data', (data: string) => {
                ringBuffer.enq(data);
            });
        } catch (err) {
            // node-pty throws exceptions on Windows.
            // Call the client error handler, but first give them a chance to register it.
            process.nextTick(() => {
                // Normalize the error to make it as close as possible as what
                // node's child_process.spawn would generate in the same
                // situation.
                const message: string = err.message;

                if (message.startsWith('File not found: ')) {
                    err.errno = 'ENOENT';
                    err.code = 'ENOENT';
                    err.path = options.command;
                }

                this.errorEmitter.fire(err);
            });
        }
    }

    createOutputStream(): MultiRingBufferReadableStream {
        return this.ringBuffer.getStream();
    }

    get pid() {
        return this.terminal.pid;
    }

    kill(signal?: string) {
        if (this.killed === false) {
            this.terminal.kill(signal);
        }
    }

    resize(cols: number, rows: number): void {
        this.terminal.resize(cols, rows);
    }

    write(data: string): void {
        this.terminal.write(data);
    }

}
