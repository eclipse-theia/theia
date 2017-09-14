/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { ProcessManager } from './process-manager';
import { ILogger } from '@theia/core/lib/common';
import { Process } from './process';
import * as child from 'child_process';
import * as stream from 'stream';

export const RawProcessOptions = Symbol("RawProcessOptions");
export interface RawProcessOptions {
    command: string,
    args?: string[],
    options?: object
}

export const RawProcessFactory = Symbol("RawProcessFactory");
export type RawProcessFactory = (options: RawProcessOptions) => RawProcess;

@injectable()
export class RawProcess extends Process {

    readonly type: 'Raw' | 'Terminal' = 'Raw';
    output: stream.Readable;
    errorOutput: stream.Readable;
    protected process: child.ChildProcess;
    protected terminal = undefined;

    constructor(
        @inject(RawProcessOptions) options: RawProcessOptions,
        @inject(ProcessManager) processManager: ProcessManager,
        @inject(ILogger) logger: ILogger) {
        super(processManager, logger);

        this.logger.debug(`Starting raw process : ${options.command},`
            + ` with args : ${options.args}, `
            + ` options ${JSON.stringify(options.options)} `);

        this.process = child.spawn(
            options.command,
            options.args,
            options.options);

        this.process.on('error', this.emitOnError.bind(this));
        this.process.on('exit', this.emitOnExit.bind(this));

        this.output = this.process.stdout;
        this.errorOutput = this.process.stderr;
    }

    get pid() {
        return this.process.pid;
    }

    kill(signal?: string) {
        if (this.killed === false) {
            this.process.kill(signal);
        }
    }
}
