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
} from '../../api/plugin-api';
import * as theia from '@theia/plugin';
import * as converter from '../type-converters';
import { Disposable } from '../types-impl';
import { RPCProtocol } from '../../api/rpc-protocol';
import { TaskProviderAdapter } from './task-provider';
import { Emitter, Event } from '@theia/core/lib/common/event';

export class TasksExtImpl implements TasksExt {
    private proxy: TasksMain;

    private callId = 0;
    private adaptersMap = new Map<number, TaskProviderAdapter>();
    private executions = new Map<number, theia.TaskExecution>();

    private readonly onDidExecuteTask: Emitter<theia.TaskStartEvent> = new Emitter<theia.TaskStartEvent>();
    private readonly onDidTerminateTask: Emitter<theia.TaskEndEvent> = new Emitter<theia.TaskEndEvent>();

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.TASKS_MAIN);
        this.fetchTaskExecutions();
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

    registerTaskProvider(type: string, provider: theia.TaskProvider): theia.Disposable {
        const callId = this.addNewAdapter(new TaskProviderAdapter(provider));
        this.proxy.$registerTaskProvider(callId, type);
        return this.createDisposable(callId);
    }

    $provideTasks(handle: number): Promise<TaskDto[] | undefined> {
        const adapter = this.adaptersMap.get(handle);
        if (adapter) {
            return adapter.provideTasks();
        } else {
            return Promise.reject(new Error('No adapter found to provide tasks'));
        }
    }

    $resolveTask(handle: number, task: TaskDto): Promise<TaskDto | undefined> {
        const adapter = this.adaptersMap.get(handle);
        if (adapter) {
            return adapter.resolveTask(task);
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

    private async fetchTaskExecutions() {
        try {
            const taskExecutions = await this.proxy.$taskExecutions();
            taskExecutions.forEach(execution => this.getTaskExecution(execution));
        } catch (error) {
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
