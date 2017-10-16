/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable, inject } from 'inversify';
import * as stream from 'stream';
import { IDebugProcess } from '@theia/debug/lib/node/debug-process';
import { TerminalProcess, ProcessManager } from '@theia/process/lib/node';
import { ILogger } from '@theia/core/lib/common';

const pty = require("node-pty");
const termios = require('termios');

export class GDBTerminalWritableStream extends stream.Writable {

    constructor(protected readonly terminal: any, opts?: any) {
        super(opts);
    }
    _write(chunk: any, encoding: string, callback: Function) {
        this.terminal.write(chunk.toString());
        callback();
    }
}

class GDBTerminalReadableStream extends stream.Readable {
    constructor(protected readonly terminal: any, opts?: any) {
        super(opts);
        this.terminal.on('data', (data: any) => {
            this.push(data);
        })
    }
    _read(size: number) {
    }
}

export const GDBTerminalProcessFactory = Symbol("GDBTerminalProcessFactory");
export type GDBTerminalProcessFactory = (options: GDBTerminalProcessOptions) => GDBTerminalProcess;

export const GDBTerminalProcessOptions = Symbol("GDBTerminalProcessOptions");

export interface GDBTerminalProcessOptions {
    command: string,
    args?: string[],
    options?: object
}

@injectable()
export class GDBTerminalProcess extends TerminalProcess implements IDebugProcess {

    public readStream = new stream.Readable;
    public writeStream: GDBTerminalWritableStream;
    public process: any;
    public terminal: any;

    protected pty: any;

    constructor(
        @inject(GDBTerminalProcessOptions) options: GDBTerminalProcessOptions,
        @inject(ProcessManager) processManager: ProcessManager,
        @inject(ILogger) protected readonly logger: ILogger) {
        super({
            command: options.command,
            overideSpawn: true
        }, processManager, logger);
        this.spawn(options.command, options.args, options.options);
    }

    spawn(command: string, args?: string[], options?: object) {
        try {
            this.pty = pty.open();
            this.logger.info(`Opened pty: ${this.pty._pty}`)

            /* FIXME this is using a protected property of this.pty */
            termios.setattr(this.pty._fd, { lflag: { ECHO: false } });

            this.writeStream = new GDBTerminalWritableStream(this.pty);
            this.readStream = new GDBTerminalReadableStream(this.pty);

            if (args === undefined) {
                args = [];
            }

            args.push('-iex');
            args.push(`new-ui mi ${this.pty._pty.toString()}`);
            args.push('-iex');
            args.push('set pagination off');

            super.spawn(command, args,
                {
                    name: 'xterm-color',
                    cols: 80,
                    rows: 24,
                    cwd: process.env.PWD,
                    env: process.env
                }
            );
        } catch (error) {
            this.errorEmitter.fire(error);
        }
    }
}
