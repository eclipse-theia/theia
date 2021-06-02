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

import { inject, injectable, named } from '@theia/core/shared/inversify';
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
        @inject(ILogger) @named('terminal') protected readonly logger: ILogger
    ) {
        super(processManager, logger);
    }

    create(options: ITerminalServerOptions): Promise<number> {
        return new Promise<number>((resolve, reject) => {
            const term = this.terminalFactory(options);
            term.onStart(_ => {
                this.postCreate(term);
                resolve(term.id);
            });
            term.onError(error => {
                this.logger.error('Error while creating terminal', error);
                resolve(-1);
            });
        });

    }
}
