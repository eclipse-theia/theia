/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import {
    PLUGIN_RPC_CONTEXT,
    TasksExt,
    TasksMain,
    TaskDto,
    TaskExecutionDto
} from '../../common/plugin-api-rpc';
import * as theia from '@theia/plugin';
import * as converter from '../type-converters';
import { Disposable } from '../types-impl';
import { RPCProtocol, ConnectionClosedError } from '../../common/rpc-protocol';
import { TaskProviderAdapter } from './task-provider';
import { Emitter, Event } from '@theia/core/lib/common/event';

export class TasksExtImpl implements TasksExt {
    private proxy: TasksMain;

    private callId = 0;
    private adaptersMap = new Map<number, TaskProviderAdapter>();
    private executions = new Map<number, theia.TaskExecution>();

    private readonly onDidExecuteTask: Emitter<theia.TaskStartEvent> = new Emitter<theia.TaskStartEvent>();
    private readonly onDidTerminateTask: Emitter<theia.TaskEndEvent> = new Emitter<theia.TaskEndEvent>();
    private readonly onDidExecuteTaskProcess: Emitter<theia.TaskProcessStartEvent> = new Emitter<theia.TaskProcessStartEvent>();
    private readonly onDidTerminateTaskProcess: Emitter<theia.TaskProcessEndEvent> = new Emitter<theia.TaskProcessEndEvent>();

    private disposed = false;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.TASKS_MAIN);
        this.fetchTaskExecutions();
    }

    dispose(): void {
        this.disposed = true;
    }

    get taskExecutions(): ReadonlyArray<theia.TaskExecution> {
        return [...this.executions.values()];
    }

    get onDidStartTask(): Event<theia.TaskStartEvent> {
        return this.onDidExecuteTask.event;
    }

    $onDidStartTask(execution: TaskExecutionDto): void {
        this.onDidExecuteTask.fire({
            execution: this.getTaskExecution(execution)
        });
    }

    get onDidEndTask(): Event<theia.TaskEndEvent> {
        return this.onDidTerminateTask.event;
    }

    $onDidEndTask(id: number): void {
        const taskExecution = this.executions.get(id);
        if (!taskExecution) {
            throw new Error(`Task execution with id ${id} is not found`);
        }

        this.executions.delete(id);

        this.onDidTerminateTask.fire({
            execution: taskExecution
        });
    }

    get onDidStartTaskProcess(): Event<theia.TaskProcessStartEvent> {
        return this.onDidExecuteTaskProcess.event;
    }

    $onDidStartTaskProcess(processId: number, executionDto: TaskExecutionDto): void {
        this.onDidExecuteTaskProcess.fire({
            processId,
            execution: this.getTaskExecution(executionDto)
        });
    }

    get onDidEndTaskProcess(): Event<theia.TaskProcessEndEvent> {
        return this.onDidTerminateTaskProcess.event;
    }

    $onDidEndTaskProcess(exitCode: number, taskId: number): void {
        const taskExecution = this.executions.get(taskId);
        if (!taskExecution) {
            throw new Error(`Task execution with id ${taskId} is not found`);
        }

        this.onDidTerminateTaskProcess.fire({
            execution: taskExecution,
            exitCode
        });
    }

    registerTaskProvider(type: string, provider: theia.TaskProvider): theia.Disposable {
        const callId = this.addNewAdapter(new TaskProviderAdapter(provider));
        this.proxy.$registerTaskProvider(callId, type);
        return this.createDisposable(callId);
    }

    async fetchTasks(filter?: theia.TaskFilter): Promise<theia.Task[]> {
        const taskVersion = filter ? filter.version : undefined;
        const taskType = filter ? filter.type : undefined;
        const taskDtos = await this.proxy.$fetchTasks(taskVersion, taskType);
        return taskDtos.map(dto => converter.toTask(dto));
    }

    async executeTask(task: theia.Task): Promise<theia.TaskExecution> {
        const taskDto = converter.fromTask(task);
        if (taskDto) {
            const executionDto = await this.proxy.$executeTask(taskDto);
            if (executionDto) {
                const taskExecution = this.getTaskExecution(executionDto);
                return taskExecution;
            }
            throw new Error('Run task config does not return after being started');
        }
        throw new Error('Task was not successfully transformed into a task config');
    }

    $provideTasks(handle: number, token?: theia.CancellationToken): Promise<TaskDto[] | undefined> {
        const adapter = this.adaptersMap.get(handle);
        if (adapter) {
            return adapter.provideTasks(token);
        } else {
            return Promise.reject(new Error('No adapter found to provide tasks'));
        }
    }

    $resolveTask(handle: number, task: TaskDto, token?: theia.CancellationToken): Promise<TaskDto | undefined> {
        const adapter = this.adaptersMap.get(handle);
        if (adapter) {
            return adapter.resolveTask(task, token);
        } else {
            return Promise.reject(new Error('No adapter found to resolve task'));
        }
    }

    private addNewAdapter(adapter: TaskProviderAdapter): number {
        const callId = this.nextCallId();
        this.adaptersMap.set(callId, adapter);
        return callId;
    }

    private nextCallId(): number {
        return this.callId++;
    }

    private createDisposable(callId: number): theia.Disposable {
        return new Disposable(() => {
            this.adaptersMap.delete(callId);
            this.proxy.$unregister(callId);
        });
    }

    private async fetchTaskExecutions(): Promise<void> {
        try {
            const taskExecutions = await this.proxy.$taskExecutions();
            taskExecutions.forEach(execution => this.getTaskExecution(execution));
        } catch (error) {
            if (this.disposed && ConnectionClosedError.is(error)) {
                return;
            }
            console.error(`Can not fetch running tasks: ${error}`);
        }
    }

    private getTaskExecution(execution: TaskExecutionDto): theia.TaskExecution {
        const executionId = execution.id;
        let result: theia.TaskExecution | undefined = this.executions.get(executionId);
        if (result) {
            return result;
        }

        result = {
            task: converter.toTask(execution.task),
            terminate: () => {
                this.proxy.$terminateTask(executionId);
            }
        };
        this.executions.set(executionId, result);
        return result;
    }
}
