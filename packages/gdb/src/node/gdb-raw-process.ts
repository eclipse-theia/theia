/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable, inject } from 'inversify';
import * as child from 'child_process';
import { IDebugProcess } from '@theia/debug/lib/node/debug-process';
import { RawProcess, ProcessManager } from '@theia/process/lib/node';
import { ILogger, Path } from '@theia/core/lib/common';

export const GDBRawProcessFactory = Symbol("GDBRawProcessFactory");
export type DebugRawProcessFactory = (options: GDBRawProcessOptions) => GDBRawProcess;

export const GDBRawProcessOptions = Symbol("GDBRawProcessOptions");
export interface GDBRawProcessOptions {
    command: string,
    args?: string[],
    options?: object
}

@injectable()
export class GDBRawProcess extends RawProcess implements IDebugProcess {

    public writeStream: NodeJS.WritableStream;
    public readStream: NodeJS.ReadableStream;
    public process: child.ChildProcess;
    public terminal: any;

    protected args: string[];
    protected path: Path;

    constructor(
        @inject(GDBRawProcessOptions) options: GDBRawProcessOptions,
        @inject(ProcessManager) processManager: ProcessManager,
        @inject(ILogger) protected readonly logger: ILogger) {
        super(options, processManager, logger);
        this.writeStream = this.process.stdin;
        this.readStream = this.process.stdout;
    }
}
