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
    TasksExt
} from '../../api/plugin-api';
import { RPCProtocol } from '../../api/rpc-protocol';
import { DisposableCollection } from '@theia/core';
import { TaskProviderRegistry, TaskResolverRegistry, TaskProvider, TaskResolver } from '@theia/task/lib/browser/task-contribution';
import { interfaces } from 'inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { TaskInfo, TaskExitedEvent } from '@theia/task/lib/common/task-protocol';
import { TaskWatcher } from '@theia/task/lib/common/task-watcher';
import { TaskService } from '@theia/task/lib/browser/task-service';

export class TasksMainImpl implements TasksMain {
    private workspaceRootUri: string | undefined = undefined;

    private readonly proxy: TasksExt;
    private readonly disposables = new Map<number, monaco.IDisposable>();
    private readonly taskProviderRegistry: TaskProviderRegistry;
    private readonly taskResolverRegistry: TaskResolverRegistry;
    private readonly taskWatcher: TaskWatcher;
    private readonly taskService: TaskService;
    private readonly workspaceService: WorkspaceService;

    constructor(rpc: RPCProtocol, container: interfaces.Container, ) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.TASKS_EXT);
        this.taskProviderRegistry = container.get(TaskProviderRegistry);
        this.taskResolverRegistry = container.get(TaskResolverRegistry);
        this.workspaceService = container.get(WorkspaceService);
        this.taskWatcher = container.get(TaskWatcher);
        this.taskService = container.get(TaskService);

        this.workspaceService.roots.then(roots => {
            const root = roots[0];
            if (root) {
                this.workspaceRootUri = root.uri;
            }
        });

        this.taskWatcher.onTaskCreated((event: TaskInfo) => {
            if (event.ctx === this.workspaceRootUri) {
                this.proxy.$onDidStartTask({
                    id: event.taskId,
                    task: event.config
                });
            }
        });

        this.taskWatcher.onTaskExit((event: TaskExitedEvent) => {
            if (event.ctx === this.workspaceRootUri) {
                this.proxy.$onDidEndTask(event.taskId);
            }
        });
    }

    $registerTaskProvider(handle: number, type: string): void {
        const taskProvider = this.createTaskProvider(handle);
        const taskResolver = this.createTaskResolver(handle);

        const disposable = new DisposableCollection();
        disposable.push(this.taskProviderRegistry.register(type, taskProvider));
        disposable.push(this.taskResolverRegistry.register(type, taskResolver));
        this.disposables.set(handle, disposable);
    }

    $unregister(handle: number): void {
        const disposable = this.disposables.get(handle);
        if (disposable) {
            disposable.dispose();
            this.disposables.delete(handle);
        }
    }

    async $taskExecutions() {
        const runningTasks = await this.taskService.getRunningTasks();
        return runningTasks.map(taskInfo => ({
            id: taskInfo.taskId,
            task: taskInfo.config
        }));
    }

    $terminateTask(id: number): void {
        this.taskService.kill(id);
    }

    protected createTaskProvider(handle: number): TaskProvider {
        return {
            provideTasks: () =>
                this.proxy.$provideTasks(handle).then(v => v!.map(taskDto =>
                    Object.assign(taskDto, { _source: taskDto.source || 'plugin' })
                )),
        };
    }

    protected createTaskResolver(handle: number): TaskResolver {
        return {
            resolveTask: taskConfig =>
                this.proxy.$resolveTask(handle, taskConfig).then(v => Object.assign(v!, { _source: v!.source || 'plugin' })),
        };
    }
}
