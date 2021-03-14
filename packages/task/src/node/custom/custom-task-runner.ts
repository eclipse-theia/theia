/********************************************************************************
 * Copyright (C) 2017-2019 Ericsson and others.
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TaskConfiguration } from '../../common';
import { Task } from '../task';
import { TaskRunner } from '../task-runner';
import { injectable, inject, named } from 'inversify';
import { ILogger } from '@theia/core';
import { TaskFactory } from './custom-task';
import {
    RawProcessFactory,
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

    @inject(RawProcessFactory)
    protected readonly rawProcessFactory: RawProcessFactory;

    @inject(TerminalProcessFactory)
    protected readonly terminalProcessFactory: TerminalProcessFactory;

    @inject(TaskFactory)
    protected readonly taskFactory: TaskFactory;

    async run(tskConfig: TaskConfiguration, ctx?: string): Promise<Task> {
        try {
            const terminalProcessOptions = { isPseudo: true } as TerminalProcessOptions;
            const terminal: Process = this.terminalProcessFactory(terminalProcessOptions);

            // Wait for the confirmation that the process is successfully started, or has failed to start.
            // await new Promise((resolve, reject) => {
            //     terminal.onStart(resolve);
            //     terminal.onError((error: ProcessErrorEvent) => {
            //         reject(ProcessTaskError.CouldNotRun(error.code));
            //     });
            // });

            return Promise.resolve(this.taskFactory({
                context: ctx,
                config: tskConfig,
                label: tskConfig.label,
                process: terminal,
            }));
        } catch (error) {
            this.logger.error(`Error occurred while creating task: ${error}`);
            throw error;
        }
    }
}
