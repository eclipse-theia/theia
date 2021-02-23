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
    TasksMain,
    MAIN_RPC_CONTEXT,
    TaskExecutionDto,
    TasksExt,
    TaskDto
} from '../../common/plugin-api-rpc';
import { RPCProtocol } from '../../common/rpc-protocol';
import { Disposable, DisposableCollection } from '@theia/core/lib/common';
import { TaskProviderRegistry, TaskResolverRegistry, TaskProvider, TaskResolver } from '@theia/task/lib/browser/task-contribution';
import { interfaces } from '@theia/core/shared/inversify';
import { TaskInfo, TaskExitedEvent, TaskConfiguration, TaskCustomization } from '@theia/task/lib/common/task-protocol';
import { TaskWatcher } from '@theia/task/lib/common/task-watcher';
import { TaskService } from '@theia/task/lib/browser/task-service';
import { TaskDefinitionRegistry } from '@theia/task/lib/browser';

export class TasksMainImpl implements TasksMain, Disposable {
    private readonly proxy: TasksExt;
    private readonly taskProviderRegistry: TaskProviderRegistry;
    private readonly taskResolverRegistry: TaskResolverRegistry;
    private readonly taskWatcher: TaskWatcher;
    private readonly taskService: TaskService;
    private readonly taskDefinitionRegistry: TaskDefinitionRegistry;

    private readonly taskProviders = new Map<number, Disposable>();
    private readonly toDispose = new DisposableCollection();

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.TASKS_EXT);
        this.taskProviderRegistry = container.get(TaskProviderRegistry);
        this.taskResolverRegistry = container.get(TaskResolverRegistry);
        this.taskWatcher = container.get(TaskWatcher);
        this.taskService = container.get(TaskService);
        this.taskDefinitionRegistry = container.get(TaskDefinitionRegistry);

        this.toDispose.push(this.taskWatcher.onTaskCreated((event: TaskInfo) => {
            this.proxy.$onDidStartTask({
                id: event.taskId,
                task: this.fromTaskConfiguration(event.config)
            });
        }));

        this.toDispose.push(this.taskWatcher.onTaskExit((event: TaskExitedEvent) => {
            this.proxy.$onDidEndTask(event.taskId);
        }));

        this.toDispose.push(this.taskWatcher.onDidStartTaskProcess((event: TaskInfo) => {
            if (event.processId !== undefined) {
                this.proxy.$onDidStartTaskProcess(event.processId, {
                    id: event.taskId,
                    task: this.fromTaskConfiguration(event.config)
                });
            }
        }));

        this.toDispose.push(this.taskWatcher.onDidEndTaskProcess((event: TaskExitedEvent) => {
            if (event.code !== undefined) {
                this.proxy.$onDidEndTaskProcess(event.code, event.taskId);
            }
        }));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    $registerTaskProvider(handle: number, type: string): void {
        const taskProvider = this.createTaskProvider(handle);
        const taskResolver = this.createTaskResolver(handle);

        const toDispose = new DisposableCollection(
            this.taskProviderRegistry.register(type, taskProvider, handle),
            this.taskResolverRegistry.register(type, taskResolver),
            Disposable.create(() => this.taskProviders.delete(handle))
        );
        this.taskProviders.set(handle, toDispose);
        this.toDispose.push(toDispose);
    }

    $unregister(handle: number): void {
        const disposable = this.taskProviders.get(handle);
        if (disposable) {
            disposable.dispose();
        }
    }

    async $fetchTasks(taskVersion: string | undefined, taskType: string | undefined): Promise<TaskDto[]> {
        if (taskVersion && !taskVersion.startsWith('2.')) { // Theia does not support 1.x or earlier task versions
            return [];
        }

        const token: number = this.taskService.startUserAction();
        const [configured, provided] = await Promise.all([
            this.taskService.getConfiguredTasks(token),
            this.taskService.getProvidedTasks(token)
        ]);
        const result: TaskDto[] = [];
        for (const tasks of [configured, provided]) {
            for (const task of tasks) {
                if (!taskType || (!!this.taskDefinitionRegistry.getDefinition(task) ? task._source === taskType : task.type === taskType)) {
                    const { type, label, _scope, _source, ...properties } = task;
                    const dto: TaskDto = { type, label, scope: _scope, source: _source };
                    for (const key in properties) {
                        if (properties.hasOwnProperty(key)) {
                            dto[key] = properties[key];
                        }
                    }
                    result.push(dto);
                }
            }
        }
        return result;
    }

    async $executeTask(taskDto: TaskDto): Promise<TaskExecutionDto | undefined> {
        const taskConfig = this.toTaskConfiguration(taskDto);
        const taskInfo = await this.taskService.runTask(taskConfig);
        if (taskInfo) {
            return {
                id: taskInfo.taskId,
                task: this.fromTaskConfiguration(taskInfo.config)
            };
        }
    }

    async $taskExecutions(): Promise<{
        id: number;
        task: TaskDto;
    }[]> {
        const runningTasks = await this.taskService.getRunningTasks();
        return runningTasks.map(taskInfo => ({
            id: taskInfo.taskId,
            task: this.fromTaskConfiguration(taskInfo.config)
        }));
    }

    $terminateTask(id: number): void {
        this.taskService.kill(id);
    }

    protected createTaskProvider(handle: number): TaskProvider {
        return {
            provideTasks: () =>
                this.proxy.$provideTasks(handle).then(v =>
                    v!.map(taskDto =>
                        this.toTaskConfiguration(taskDto)
                    )
                )
        };
    }

    protected createTaskResolver(handle: number): TaskResolver {
        return {
            resolveTask: taskConfig =>
                this.proxy.$resolveTask(handle, this.fromTaskConfiguration(taskConfig)).then(v =>
                    this.toTaskConfiguration(v!)
                )
        };
    }

    protected toTaskConfiguration(taskDto: TaskDto): TaskConfiguration {
        const { group, ...taskConfiguration } = taskDto;
        if (group === 'build' || group === 'test') {
            taskConfiguration.group = group;
        }

        return Object.assign(taskConfiguration, {
            _source: taskConfiguration.source,
            _scope: taskConfiguration.scope
        });
    }

    protected fromTaskConfiguration(task: TaskConfiguration): TaskDto {
        const { group, ...taskDto } = task;
        if (group) {
            if (TaskCustomization.isBuildTask(task)) {
                taskDto.group = 'build';
            } else if (TaskCustomization.isTestTask(task)) {
                taskDto.group = 'test';
            }
        }

        return Object.assign(taskDto, {
            source: taskDto._source,
            scope: taskDto._scope
        });
    }

}
