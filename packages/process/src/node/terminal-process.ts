/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import * as stream from 'stream';
import { ILogger } from '@theia/core/lib/common';
import { Process, ProcessType } from './process';
import { ProcessManager } from './process-manager';
import * as pty from 'node-pty';
import { ITerminal } from 'node-pty/lib/interfaces';

export const TerminalProcessOptions = Symbol("TerminalProcessOptions");
export interface TerminalProcessOptions {
    readonly command: string,
    readonly args?: string[],
    readonly options?: object
}

export const TerminalProcessFactory = Symbol("TerminalProcessFactory");
export type TerminalProcessFactory = (options: TerminalProcessOptions) => TerminalProcess;

/* Use this instead of the node-pty stream, since the node-pty stream is already resumed.  */
class ReadableTerminalStream extends stream.Readable {

    constructor(protected readonly terminal: ITerminal, opts?: stream.ReadableOptions) {
        super(opts);
        this.terminal.on('data', data => this.push(data));
    }

    /* This needs to be implemented as per node's API doc, even if it's empty.  */
    _read(size: number) {
    }

}

class WritableTerminalStream extends stream.Writable {

    constructor(protected readonly terminal: ITerminal) {
        super({
            write: (chunk, encoding, next) => {
                this.terminal.write(chunk.toString());
                next();
            }
        });
    }

}

@injectable()
export class TerminalProcess extends Process {

    readonly input: stream.Writable;
    readonly output: stream.Readable;
    protected readonly terminal: ITerminal;

    constructor(
        @inject(TerminalProcessOptions) options: TerminalProcessOptions,
        @inject(ProcessManager) processManager: ProcessManager,
        @inject(ILogger) logger: ILogger) {
        super(processManager, logger, ProcessType.Terminal);

        this.logger.debug(`Starting terminal process: ${options.command},`
            + ` with args : ${options.args}, `
            + ` options ${JSON.stringify(options.options)}`);

        this.terminal = pty.spawn(
            options.command,
            options.args,
            options.options);

        this.terminal.on('exit', this.emitOnExit.bind(this));
        this.output = new ReadableTerminalStream(this.terminal);
        this.input = new WritableTerminalStream(this.terminal);
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
