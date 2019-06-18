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

import { injectable, inject, named } from 'inversify';
import { ILogger } from '@theia/core/lib/common/';
import { Process } from '@theia/process/lib/node';
import { Task, TaskOptions } from '../task';
import { TaskManager } from '../task-manager';
import { ProcessType, ProcessTaskInfo } from '../../common/process/task-protocol';

export const TaskProcessOptions = Symbol('TaskProcessOptions');
export interface TaskProcessOptions extends TaskOptions {
    process: Process,
    processType: ProcessType
}

export const TaskFactory = Symbol('TaskFactory');
export type TaskFactory = (options: TaskProcessOptions) => ProcessTask;

/** Represents a Task launched as a process by `ProcessTaskRunner`. */
@injectable()
export class ProcessTask extends Task {

    constructor(
        @inject(TaskManager) protected readonly taskManager: TaskManager,
        @inject(ILogger) @named('task') protected readonly logger: ILogger,
        @inject(TaskProcessOptions) protected readonly options: TaskProcessOptions
    ) {
        super(taskManager, logger, options);

        const toDispose =
            this.process.onExit(event => {
                toDispose.dispose();
                this.fireTaskExited({
                    taskId: this.taskId,
                    ctx: this.options.context,
                    code: event.code,
                    signal: event.signal,
                    config: this.options.config
                });
            });

        this.logger.info(`Created new task, id: ${this.id}, process id: ${this.options.process.id}, OS PID: ${this.process.pid}, context: ${this.context}`);
    }

    kill(): Promise<void> {
        return new Promise<void>(resolve => {
            if (this.process.killed) {
                resolve();
            } else {
                const toDispose = this.process.onExit(event => {
                    toDispose.dispose();
                    resolve();
                });
                this.process.kill();
            }
        });
    }

    getRuntimeInfo(): ProcessTaskInfo {
        return {
            taskId: this.id,
            ctx: this.context,
            config: this.options.config,
            terminalId: (this.processType === 'shell') ? this.process.id : undefined,
            processId: this.processType === 'process' ? this.process.id : undefined
        };
    }
    get process() {
        return this.options.process;
    }

    get processType() {
        return this.options.processType;
    }
}
