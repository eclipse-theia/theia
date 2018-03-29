/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, named } from 'inversify';
import { ILogger } from '@theia/core/lib/common';
import { Process, ProcessType, ProcessOptions } from './process';
import { ProcessManager } from './process-manager';
import * as pty from 'node-pty';
import { ITerminal } from 'node-pty/lib/interfaces';
import { MultiRingBuffer, MultiRingBufferReadableStream } from './multi-ring-buffer';

export const TerminalProcessOptions = Symbol("TerminalProcessOptions");
export interface TerminalProcessOptions extends ProcessOptions {
}

export const TerminalProcessFactory = Symbol("TerminalProcessFactory");
export interface TerminalProcessFactory {
    (options: TerminalProcessOptions): TerminalProcess;
}

@injectable()
export class TerminalProcess extends Process {

    protected readonly terminal: ITerminal;

    constructor(
        @inject(TerminalProcessOptions) options: TerminalProcessOptions,
        @inject(ProcessManager) processManager: ProcessManager,
        @inject(MultiRingBuffer) protected readonly ringBuffer: MultiRingBuffer,
        @inject(ILogger) @named('process') logger: ILogger) {
        super(processManager, logger, ProcessType.Terminal, options);

        this.logger.debug(`Starting terminal process: ${options.command},`
            + ` with args : ${options.args}, `
            + ` options ${JSON.stringify(options.options)}`);

        this.terminal = pty.spawn(
            options.command,
            options.args,
            options.options);

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
