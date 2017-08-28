/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import * as stream from 'stream';
import { ILogger } from '../../common/logger';
import { Process } from './process';

const pty = require("node-pty");

export const TerminalProcessOptions = Symbol("TerminalProcessOptions");
export interface TerminalProcessOptions {
    command: string,
    args?: string[],
    options?: object
}

export const TerminalProcessFactory = Symbol("TerminalProcessFactory");
export type TerminalProcessFactory = (options: TerminalProcessOptions) => TerminalProcess;

/* Use this instead of the node-pty stream, since the node-pty stream is already resumed.  */
export class TerminalReadableStream extends stream.Readable {
    constructor(protected readonly terminal: any, opts?: any) {
        super(opts);
        this.terminal.on('data', (data: any) => {
            this.push(data);
        });
    }
    /* This needs to be implemented as per node's API doc, even if it's empty.  */
    _read(size: number) {
    }
}

@injectable()
export class TerminalProcess extends Process {

    readonly type: 'Raw' | 'Terminal' = 'Terminal';
    output: TerminalReadableStream;
    protected process = undefined;
    protected terminal: any;
    protected terminalReadStream: TerminalReadableStream;

    constructor(
        @inject(TerminalProcessOptions) options: TerminalProcessOptions,
        @inject(ILogger) logger: ILogger) {
        super(logger);

        this.logger.debug(`Starting terminal process: ${options.command},`
            + ` with args : ${options.args}, `
            + ` options ${JSON.stringify(options.options)} `);

        this.terminal = pty.spawn(
            options.command,
            options.args,
            options.options);

        this.terminal.on('exit', this.emitOnExit.bind(this));
        this.output = new TerminalReadableStream(this.terminal);
    }

    get pid() {
        return this.terminal.pid;
    }

    kill(signal?: string) {
        this.terminal.kill(signal);
    }

    resize(cols: number, rows: number): void {
        this.terminal.resize(cols, rows);
    }

    write(data: string): void {
        this.terminal.write(data);
    }
}

