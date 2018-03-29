/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, named } from 'inversify';
import { ILogger } from '@theia/core/lib/common/';
import { ProcessType, TaskInfo } from '../common/task-protocol';
import { TaskManager } from './task-manager';
import { Process, ProcessManager } from "@theia/process/lib/node";

export const TaskProcessOptions = Symbol("TaskProcessOptions");
export interface TaskProcessOptions {
    label: string,
    command: string,
    process: Process,
    processType: ProcessType,
    context?: string
}

export const TaskFactory = Symbol("TaskFactory");
export type TaskFactory = (options: TaskProcessOptions) => Task;

@injectable()
export class Task {
    protected taskId: number;

    constructor(
        @inject(TaskManager) protected readonly taskManager: TaskManager,
        @inject(ILogger) @named('task') protected readonly logger: ILogger,
        @inject(TaskProcessOptions) protected readonly options: TaskProcessOptions,
        @inject(ProcessManager) protected readonly processManager: ProcessManager
    ) {
        this.taskId = this.taskManager.register(this, this.options.context);

        const toDispose =
            this.process.onExit(event => {
                this.taskManager.delete(this);
                toDispose.dispose();
            });
        this.logger.info(`Created new task, id: ${this.id}, process id: ${this.options.process.id}, OS PID: ${this.process.pid}, context: ${this.context}`);
    }

    /** terminates the task */
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

    /** Returns runtime information about task */
    getRuntimeInfo(): TaskInfo {
        return {
            taskId: this.id,
            osProcessId: this.process.pid,
            terminalId: (this.processType === 'terminal') ? this.process.id : undefined,
            processId: (this.processType === 'raw') ? this.process.id : undefined,
            command: this.command,
            label: this.label,
            ctx: this.context
        };
    }

    get command() {
        return this.options.command;
    }
    get process() {
        return this.options.process;
    }

    get id() {
        return this.taskId;
    }

    get context() {
        return this.options.context;
    }

    get processType() {
        return this.options.processType;
    }

    get label() {
        return this.options.label;
    }
}
