/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, named } from 'inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import {
    ITerminalServer,
    ITerminalServerOptions
} from '../common/terminal-protocol';
import { BaseTerminalServer } from './base-terminal-server';
import { TerminalProcessFactory, ProcessManager } from '@theia/process/lib/node';

@injectable()
export class TerminalServer extends BaseTerminalServer implements ITerminalServer {

    constructor(
        @inject(TerminalProcessFactory) protected readonly terminalFactory: TerminalProcessFactory,
        @inject(ProcessManager) protected readonly processManager: ProcessManager,
        @inject(ILogger) @named('terminal') protected readonly logger: ILogger) {
        super(processManager, logger);
    }

    create(options: ITerminalServerOptions): Promise<number> {
        try {
            const term = this.terminalFactory(options);
            this.postCreate(term);
            return Promise.resolve(term.id);
        } catch (error) {
            this.logger.error(`Error while creating terminal: ${error}`);
            return Promise.resolve(-1);
        }
    }
}
