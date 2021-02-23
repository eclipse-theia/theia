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

import { injectable, inject, named } from '@theia/core/shared/inversify';
import { isWindows } from '@theia/core';
import { ILogger } from '@theia/core/lib/common';
import { Process, ProcessType, ProcessOptions, ProcessErrorEvent } from './process';
import { ProcessManager } from './process-manager';
import { IPty, spawn } from '@theia/node-pty';
import { MultiRingBuffer, MultiRingBufferReadableStream } from './multi-ring-buffer';
import { DevNullStream } from './dev-null-stream';
import { signame } from './utils';
import { PseudoPty } from './pseudo-pty';
import { Writable } from 'stream';

export const TerminalProcessOptions = Symbol('TerminalProcessOptions');
export interface TerminalProcessOptions extends ProcessOptions {
    /**
     * Windows only. Allow passing complex command lines already escaped for CommandLineToArgvW.
     */
    commandLine?: string;
    isPseudo?: boolean;
}

export const TerminalProcessFactory = Symbol('TerminalProcessFactory');
export interface TerminalProcessFactory {
    (options: TerminalProcessOptions): TerminalProcess;
}

/**
 * Run arbitrary processes inside pseudo-terminals (PTY).
 *
 * Note: a PTY is not a shell process (bash/pwsh/cmd...)
 */
@injectable()
export class TerminalProcess extends Process {

    protected readonly terminal: IPty | undefined;

    readonly outputStream = this.createOutputStream();
    readonly errorStream = new DevNullStream({ autoDestroy: true });
    readonly inputStream: Writable;

    constructor( // eslint-disable-next-line @typescript-eslint/indent
        @inject(TerminalProcessOptions) protected readonly options: TerminalProcessOptions,
        @inject(ProcessManager) processManager: ProcessManager,
        @inject(MultiRingBuffer) protected readonly ringBuffer: MultiRingBuffer,
        @inject(ILogger) @named('process') logger: ILogger
    ) {
        super(processManager, logger, ProcessType.Terminal, options);

        if (options.isPseudo) {
            // do not need to spawn a process, new a pseudo pty instead
            this.terminal = new PseudoPty();
            this.inputStream = new DevNullStream({ autoDestroy: true });
            return;
        }

        if (this.isForkOptions(this.options)) {
            throw new Error('terminal processes cannot be forked as of today');
        }
        this.logger.debug('Starting terminal process', JSON.stringify(options, undefined, 2));

        try {
            this.terminal = spawn(
                options.command,
                (isWindows && options.commandLine) || options.args || [],
                options.options || {});

            this.terminal.on('exec', (reason: string | undefined) => {
                if (reason === undefined) {
                    this.emitOnStarted();
                } else {
                    const error = new Error(reason) as ProcessErrorEvent;
                    error.code = reason;
                    this.emitOnError(error);
                }
            });

            // node-pty actually wait for the underlying streams to be closed before emitting exit.
            // We should emulate the `exit` and `close` sequence.
            this.terminal.on('exit', (code, signal) => {
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
                process.nextTick(() => {
                    if (signal === undefined || signal === 0) {
                        this.emitOnClose(code, undefined);
                    } else {
                        this.emitOnClose(undefined, signame(signal));
                    }
                });
            });

            this.terminal.on('data', (data: string) => {
                ringBuffer.enq(data);
            });

            this.inputStream = new Writable({
                write: (chunk: string) => {
                    this.write(chunk);
                },
            });

        } catch (error) {
            this.inputStream = new DevNullStream({ autoDestroy: true });

            // Normalize the error to make it as close as possible as what
            // node's child_process.spawn would generate in the same
            // situation.
            const message: string = error.message;

            if (message.startsWith('File not found: ')) {
                error.errno = 'ENOENT';
                error.code = 'ENOENT';
                error.path = options.command;
            }

            // node-pty throws exceptions on Windows.
            // Call the client error handler, but first give them a chance to register it.
            this.emitOnErrorAsync(error);
        }
    }

    createOutputStream(): MultiRingBufferReadableStream {
        return this.ringBuffer.getStream();
    }

    get pid(): number {
        this.checkTerminal();
        return this.terminal!.pid;
    }

    get executable(): string {
        return (this.options as ProcessOptions).command;
    }

    get arguments(): string[] {
        return this.options.args || [];
    }

    kill(signal?: string): void {
        if (this.terminal && this.killed === false) {
            this.terminal.kill(signal);
        }
    }

    resize(cols: number, rows: number): void {
        this.checkTerminal();
        this.terminal!.resize(cols, rows);
    }

    write(data: string): void {
        this.checkTerminal();
        this.terminal!.write(data);
    }

    protected checkTerminal(): void | never {
        if (!this.terminal) {
            throw new Error('pty process did not start correctly');
        }
    }

}
