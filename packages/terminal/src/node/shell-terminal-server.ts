/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, named } from 'inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { IShellTerminalServerOptions } from '../common/shell-terminal-protocol';
import { BaseTerminalServer } from '../node/base-terminal-server';
import { ShellProcessFactory } from '../node/shell-process';
import { ProcessManager } from '@theia/process/lib/node';

@injectable()
export class ShellTerminalServer extends BaseTerminalServer {

    constructor(
        @inject(ShellProcessFactory) protected readonly shellFactory: ShellProcessFactory,
        @inject(ProcessManager) processManager: ProcessManager,
        @inject(ILogger) @named('terminal') logger: ILogger) {
        super(processManager, logger);
    }

    create(options: IShellTerminalServerOptions): Promise<number> {
        try {
            const term = this.shellFactory(options);
            this.postCreate(term);
            return Promise.resolve(term.id);
        } catch (error) {
            this.logger.error(`Error while creating terminal: ${error}`);
            return Promise.resolve(-1);
        }
    }
}
