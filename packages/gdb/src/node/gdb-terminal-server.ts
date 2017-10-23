/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { IGDBTerminalServerOptions } from '../common/gdb-terminal-protocol';
import { BaseTerminalServer } from '@theia/terminal/lib/node/base-terminal-server';
import { ProcessManager } from '@theia/process/lib/node';

@injectable()
export class GDBTerminalServer extends BaseTerminalServer {

    constructor(
        @inject(ProcessManager) processManager: ProcessManager,
        @inject(ILogger) logger: ILogger) {
        super(processManager, logger);
    }

    create(options: IGDBTerminalServerOptions): Promise<number> {
        this.logger.error(`Not implemented`);
        return Promise.resolve(-1);
    }
}
