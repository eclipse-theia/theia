// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import * as theia from '@theia/plugin';
import { TaskDto } from '../../common';
import * as Converter from '../type-converters';
import { CustomExecution } from '../types-impl';

type ExecutionCallback = (resolvedDefinition: theia.TaskDefinition) => Thenable<theia.Pseudoterminal>;

export class TaskProviderAdapter {

    private readonly customExecutions = new Map<ExecutionCallback, theia.CustomExecution>();

    constructor(private readonly provider: theia.TaskProvider) { }

    /** The CustomExecution behind a callback in a task this adapter just provided or resolved. */
    takeCustomExecution(callback: ExecutionCallback): theia.CustomExecution | undefined {
        const execution = this.customExecutions.get(callback);
        this.customExecutions.delete(callback);
        return execution;
    }

    private rememberCustomExecution(task: theia.Task): void {
        if (task.execution && CustomExecution.is(task.execution)) {
            this.customExecutions.set(task.execution.callback, task.execution);
        }
    }

    provideTasks(token: theia.CancellationToken): Promise<TaskDto[]> {
        return Promise.resolve(this.provider.provideTasks(token)).then(tasks => {
            if (!Array.isArray(tasks)) {
                return [];
            }
            const result: TaskDto[] = [];
            for (const task of tasks) {
                const data = Converter.fromTask(task);
                if (!data) {
                    continue;
                }

                this.rememberCustomExecution(task);
                result.push(data);
            }
            return result;
        });
    }

    async resolveTask(task: TaskDto, token: theia.CancellationToken): Promise<TaskDto> {
        if (typeof this.provider.resolveTask !== 'function') {
            return task;
        }

        const item = Converter.toTask(task);
        if (!item || item.execution) {
            return task;
        }

        const resolved = await this.provider.resolveTask(item, token);
        const converted = resolved ? Converter.fromTask(resolved) : Converter.fromTask(item);
        if (converted) {
            this.rememberCustomExecution(resolved ?? item);
        }
        return converted ?? task;
    }
}
