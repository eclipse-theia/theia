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

export class TasksMainImpl implements TasksMain {

    private readonly proxy: TasksExt;
    private readonly disposables = new Map<number, monaco.IDisposable>();
    private readonly taskProviderRegistry: TaskProviderRegistry;
    private readonly taskResolverRegistry: TaskResolverRegistry;

    constructor(rpc: RPCProtocol, container: interfaces.Container, ) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.TASKS_EXT);
        this.taskProviderRegistry = container.get(TaskProviderRegistry);
        this.taskResolverRegistry = container.get(TaskResolverRegistry);
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

    protected createTaskProvider(handle: number): TaskProvider {
        return {
            provideTasks: () =>
                this.proxy.$provideTasks(handle).then(v => v!),
        };
    }

    protected createTaskResolver(handle: number): TaskResolver {
        return {
            resolveTask: taskConfig =>
                this.proxy.$resolveTask(handle, taskConfig).then(v => v!),
        };
    }
}
