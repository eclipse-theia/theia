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
import { CustomExecution, Disposable } from '../types-impl';
import { RPCProtocol, ConnectionClosedError } from '../../common/rpc-protocol';
import { TaskProviderAdapter } from './task-provider';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { TerminalServiceExtImpl } from '../terminal-ext';

export class TasksExtImpl implements TasksExt {
    private proxy: TasksMain;

    private callId = 0;
    private adaptersMap = new Map<number, TaskProviderAdapter>();
    private executions = new Map<number, theia.TaskExecution>();
    protected providedCustomExecutions: Map<string, CustomExecution>;
    protected activeCustomExecutions: Map<number, CustomExecution>;

    private readonly onDidExecuteTask: Emitter<theia.TaskStartEvent> = new Emitter<theia.TaskStartEvent>();
    private readonly onDidTerminateTask: Emitter<theia.TaskEndEvent> = new Emitter<theia.TaskEndEvent>();
    private readonly onDidExecuteTaskProcess: Emitter<theia.TaskProcessStartEvent> = new Emitter<theia.TaskProcessStartEvent>();
    private readonly onDidTerminateTaskProcess: Emitter<theia.TaskProcessEndEvent> = new Emitter<theia.TaskProcessEndEvent>();

    private disposed = false;

    constructor(rpc: RPCProtocol, readonly terminalExt: TerminalServiceExtImpl) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.TASKS_MAIN);
        this.providedCustomExecutions = new Map<string, CustomExecution>();
        this.activeCustomExecutions = new Map<number, CustomExecution>();
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

    async $onDidStartTask(execution: TaskExecutionDto, terminalId: number, resolvedDefinition: theia.TaskDefinition): Promise<void> {
        const customExecution: CustomExecution | undefined = this.providedCustomExecutions.get(execution.task.id);
        if (customExecution) {
            if (this.activeCustomExecutions.get(execution.id) !== undefined) {
                throw new Error('We should not be trying to start the same custom task executions twice.');
            }

            // Clone the custom execution to keep the original untouched. This is important for multiple runs of the same task.
            this.activeCustomExecutions.set(execution.id, customExecution);
            const pty = await customExecution.callback(resolvedDefinition);
            this.terminalExt.attachPtyToTerminal(terminalId, pty);
            if (pty.onDidClose) {
                pty.onDidClose((e: number | void = undefined) => {
                    // eslint-disable-next-line no-void
                    this.proxy.$customExecutionComplete(execution.id, e === void 0 ? undefined : e);
                });
            }
        }
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
        this.customExecutionComplete(id);

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

    $provideTasks(handle: number, token: theia.CancellationToken): Promise<TaskDto[] | undefined> {
        const adapter = this.adaptersMap.get(handle);
        if (adapter) {
            return adapter.provideTasks(token).then(tasks => {
                if (tasks) {
                    for (const task of tasks) {
                        if (task.type === 'customExecution') {
                            this.providedCustomExecutions.set(task.id, new CustomExecution(task.callback));
                        }
                    }
                }
                return tasks;
            });
        } else {
            return Promise.reject(new Error('No adapter found to provide tasks'));
        }
    }

    $resolveTask(handle: number, task: TaskDto, token: theia.CancellationToken): Promise<TaskDto | undefined> {
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

    private customExecutionComplete(id: number): void {
        const extensionCallback2: CustomExecution | undefined = this.activeCustomExecutions.get(id);
        if (extensionCallback2) {
            this.activeCustomExecutions.delete(id);
        }
    }
}
