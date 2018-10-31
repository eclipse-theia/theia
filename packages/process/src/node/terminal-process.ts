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
    create(options: TerminalProcessOptions): Promise<TerminalProcess>;
}

@injectable()
export class TerminalProcessFactoryImpl implements TerminalProcessFactory {

    @inject(ProcessManager)
    processManager: ProcessManager;

    @inject(ILogger) @named('process')
    logger: ILogger;

    async create(options: TerminalProcessOptions): Promise<TerminalProcess> {
        const process = spawn(options.command, options.args || [], options.options || {});

        this.logger.debug('Starting terminal process', JSON.stringify(options, undefined, 2));

        const buffer = new MultiRingBuffer({ size: 1048576 });
        const terminalProcess = new TerminalProcess(process, buffer, this.logger);

        this.processManager.register(terminalProcess);

        return terminalProcess;
    }
}

export class TerminalProcess extends Process {

    constructor(
        protected readonly process: IPty,
        protected readonly ringBuffer: MultiRingBuffer,
        logger: ILogger
    ) {
        super(logger, ProcessType.Terminal);

        this.process.on('exit', (code: number, signal?: number) => {
            this.emitOnExit(code, signal ? signal.toString() : undefined);
        });

        this.process.on('data', (data: string) => {
            ringBuffer.enq(data);
        });
    }

    createOutputStream(): MultiRingBufferReadableStream {
        return this.ringBuffer.getStream();
    }

    get pid() {
        return this.process.pid;
    }

    kill(signal?: string) {
        if (this.killed === false) {
            this.process.kill(signal);
        }
    }

    resize(cols: number, rows: number): void {
        this.process.resize(cols, rows);
    }

    write(data: string): void {
        this.process.write(data);
    }

}
