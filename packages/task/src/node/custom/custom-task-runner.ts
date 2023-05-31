// *****************************************************************************
// Copyright (C) 2021 ByteDance and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { TaskConfiguration } from '../../common';
import { Task } from '../task';
import { TaskRunner } from '../task-runner';
import { injectable, inject, named } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core';
import { TaskFactory } from './custom-task';
import {
    TerminalProcessFactory,
    Process,
    TerminalProcessOptions,
} from '@theia/process/lib/node';

/**
 * Task runner that runs a task as a pseudoterminal open.
 */
@injectable()
export class CustomTaskRunner implements TaskRunner {

    @inject(ILogger) @named('task')
    protected readonly logger: ILogger;

    @inject(TerminalProcessFactory)
    protected readonly terminalProcessFactory: TerminalProcessFactory;

    @inject(TaskFactory)
    protected readonly taskFactory: TaskFactory;

    async run(taskConfig: TaskConfiguration, ctx?: string): Promise<Task> {
        try {
            const terminalProcessOptions = { isPseudo: true } as TerminalProcessOptions;
            const terminal: Process = this.terminalProcessFactory(terminalProcessOptions);

            return this.taskFactory({
                context: ctx,
                config: taskConfig,
                label: taskConfig.label,
                process: terminal,
            });
        } catch (error) {
            this.logger.error(`Error occurred while creating task: ${error}`);
            throw error;
        }
    }
}
