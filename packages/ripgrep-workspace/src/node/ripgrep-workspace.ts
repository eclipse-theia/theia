/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import * as process from 'process';
import { ILogger } from '@theia/core/lib/common/logger';
import { RawProcess } from '@theia/process/lib/node/raw-process';
import { ProcessManager } from '@theia/process/lib/node';
import { rgPath } from 'vscode-ripgrep';
import { isWindows } from "@theia/core/lib/common";
let commandLine = rgPath;
if (isWindows) {
    commandLine = commandLine + ".exe";
}

export const RipGrepProcessOptions = Symbol("RipGrepProcessOptions");
export interface RipGrepProcessOptions {
    args?: string[],
}
export const RipGrepProcessFactory = Symbol("RipGrepProcessFactory");
export type RipGrepProcessFactory = (options: RipGrepProcessOptions) => RipGrepWorkSpace;

@injectable()
export class RipGrepWorkSpace extends RawProcess {

    constructor(
        @inject(RipGrepProcessOptions) options: RipGrepProcessOptions,
        @inject(ProcessManager) processManager: ProcessManager,
        @inject(ILogger) logger: ILogger
    ) {
        super({
            command: commandLine,
            args: options.args,
            options: {
                name: 'xterm-color',
                cwd: process.cwd(),
                env: process.env as any
            }
        }, processManager, logger);
        console.log("commandLIne is " + commandLine);
        console.log("options.args is " + options.args);

    }
}