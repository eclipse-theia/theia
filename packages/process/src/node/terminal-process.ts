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
import { IPty, spawn } from 'node-pty';
import { MultiRingBuffer, MultiRingBufferReadableStream } from './multi-ring-buffer';

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

        this.terminal = spawn(
            options.command,
            options.args || [],
            options.options || {});

        this.terminal.on('exit', (code: number, signal?: number) => {
            this.emitOnExit(code, signal ? signal.toString() : undefined);
        });

        this.terminal.on('data', (data: string) => {
            ringBuffer.enq(data);
        });
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
