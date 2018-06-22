/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

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
            this.logger.error('Error while creating terminal', error);
            return Promise.resolve(-1);
        }
    }
}
