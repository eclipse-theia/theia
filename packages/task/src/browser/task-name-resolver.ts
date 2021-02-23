/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { TaskConfiguration } from '../common';
import { TaskDefinitionRegistry } from './task-definition-registry';
import { TaskConfigurations } from './task-configurations';

@injectable()
export class TaskNameResolver {
    @inject(TaskDefinitionRegistry)
    protected taskDefinitionRegistry: TaskDefinitionRegistry;

    @inject(TaskConfigurations)
    protected readonly taskConfigurations: TaskConfigurations;

    /**
     * Returns task name to display.
     * It is aligned with VS Code.
     */
    resolve(task: TaskConfiguration): string {
        if (this.isDetectedTask(task)) {
            const scope = task._scope;
            const rawConfigs = this.taskConfigurations.getRawTaskConfigurations(scope);
            const jsonConfig = rawConfigs.find(rawConfig => this.taskDefinitionRegistry.compareTasks({
                ...rawConfig, _scope: scope
            }, task));
            // detected task that has a `label` defined in `tasks.json`
            if (jsonConfig && jsonConfig.label) {
                return jsonConfig.label;
            }
            return `${task.source || task._source}: ${task.label}`;
        }

        // it is a hack, when task is customized but extension is absent
        return task.label || `${task.type}: ${task.task}`;
    }

    private isDetectedTask(task: TaskConfiguration): boolean {
        return !!this.taskDefinitionRegistry.getDefinition(task);
    }
}
