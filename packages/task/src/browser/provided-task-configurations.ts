/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

import { inject, injectable } from 'inversify';
import { TaskConfiguration } from '../common/task-protocol';
import { TaskProviderRegistry } from './task-contribution';

@injectable()
export class ProvidedTaskConfigurations {

    /**
     * Map of source (name of extension, or path of root folder that the task config comes from) and `task config map`.
     * For the inner map (i.e., `task config map`), the key is task label and value TaskConfiguration
     */
    protected tasksMap = new Map<string, Map<string, TaskConfiguration>>();

    @inject(TaskProviderRegistry)
    protected readonly taskProviderRegistry: TaskProviderRegistry;

    /** returns a list of provided tasks */
    async getTasks(): Promise<TaskConfiguration[]> {
        const providedTasks: TaskConfiguration[] = [];
        const providers = this.taskProviderRegistry.getProviders();
        for (const provider of providers) {
            providedTasks.push(...await provider.provideTasks());
        }
        this.cacheTasks(providedTasks);
        return providedTasks;
    }

    /** returns the task configuration for a given source and label or undefined if none */
    async getTask(source: string, taskLabel: string): Promise<TaskConfiguration | undefined> {
        const task = this.getCachedTask(source, taskLabel);
        if (task) {
            return task;
        } else {
            await this.getTasks();
            return this.getCachedTask(source, taskLabel);
        }
    }

    protected getCachedTask(source: string, taskLabel: string): TaskConfiguration | undefined {
        const labelConfigMap = this.tasksMap.get(source);
        if (labelConfigMap) {
            return labelConfigMap.get(taskLabel);
        }
    }

    protected cacheTasks(tasks: TaskConfiguration[]): void {
        for (const task of tasks) {
            const label = task.label;
            const source = task._source;
            if (this.tasksMap.has(source)) {
                this.tasksMap.get(source)!.set(label, task);
            } else {
                const labelTaskMap = new Map<string, TaskConfiguration>();
                labelTaskMap.set(label, task);
                this.tasksMap.set(source, labelTaskMap);
            }
        }
    }
}
