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
    TaskDto
} from '../../api/plugin-api';
import * as theia from '@theia/plugin';
import { Disposable } from '../types-impl';
import { RPCProtocol } from '../../api/rpc-protocol';
import { TaskProviderAdapter } from './task-provider';

export class TasksExtImpl implements TasksExt {
    private proxy: TasksMain;

    private callId = 0;
    private adaptersMap = new Map<number, TaskProviderAdapter>();

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.TASKS_MAIN);
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
}
