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

import { injectable, inject, named } from '@theia/core/shared/inversify';
import { ILogger, MaybePromise } from '@theia/core/lib/common/';
import { Task, TaskOptions } from '../task';
import { TaskManager } from '../task-manager';
import { TaskInfo } from '../../common/task-protocol';
import { Process } from '@theia/process/lib/node';

export const TaskCustomOptions = Symbol('TaskCustomOptions');
export interface TaskCustomOptions extends TaskOptions {
    process: Process
}

export const TaskFactory = Symbol('TaskFactory');
export type TaskFactory = (options: TaskCustomOptions) => CustomTask;

/** Represents a Task launched as a fake process by `CustomTaskRunner`. */
@injectable()
export class CustomTask extends Task {

    constructor(
        @inject(TaskManager) taskManager: TaskManager,
        @inject(ILogger) @named('task') logger: ILogger,
        @inject(TaskCustomOptions) protected override readonly options: TaskCustomOptions
    ) {
        super(taskManager, logger, options);
        this.logger.info(`Created new custom task, id: ${this.id}, context: ${this.context}`);
    }

    kill(): Promise<void> {
        return Promise.resolve();
    }

    getRuntimeInfo(): MaybePromise<TaskInfo> {
        return {
            taskId: this.id,
            ctx: this.context,
            config: this.options.config,
            terminalId: this.process.id,
            processId: this.process.id
        };
    }

    public callbackTaskComplete(exitCode: number | undefined): MaybePromise<void> {
        this.fireTaskExited({
            taskId: this.taskId,
            ctx: this.context,
            config: this.options.config,
            terminalId: this.process.id,
            processId: this.process.id,
            code: exitCode || 0
        });
    }

    get process(): Process {
        return this.options.process;
    }
}
