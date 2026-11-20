// *****************************************************************************
// Copyright (C) 2026 Md. Mehedi Hasan.
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

import { inject, injectable, optional } from '@theia/core/shared/inversify';
import { QuickInputService, QuickPickValue } from '@theia/core/lib/browser';
import { cancelled } from '@theia/core/lib/common/cancellation';
import { nls } from '@theia/core/lib/common/nls';
import URI from '@theia/core/lib/common/uri';
import { VariableContribution, VariableRegistry } from '@theia/variable-resolver/lib/browser';
import { TaskConfiguration, TaskCustomization } from '../common/index.js';
import { TaskNameResolver } from './task-name-resolver.js';
import { TaskService } from './task-service.js';

/**
 * Contributes the `defaultBuildTask` variable, which launch configurations can use as `preLaunchTask` like in VS Code.
 */
@injectable()
export class TaskVariableContribution implements VariableContribution {

    @inject(TaskService)
    protected readonly taskService: TaskService;

    @inject(TaskNameResolver)
    protected readonly taskNameResolver: TaskNameResolver;

    @inject(QuickInputService) @optional()
    protected readonly quickInputService: QuickInputService;

    registerVariables(variables: VariableRegistry): void {
        variables.registerVariable({
            name: 'defaultBuildTask',
            description: nls.localize('theia/task/variables/defaultBuildTask/description', 'The name of the default build task'),
            resolve: (context?: URI) => this.resolveDefaultBuildTask(context)
        });
    }

    /**
     * Returns the name of the default build task that a launch configuration in the given workspace folder can run.
     * Like Run Build Task, it looks for it among the configured tasks with `TaskCustomization.isDefaultBuildTask`.
     * If there isn't exactly one, the user picks one of the build tasks, or one of the default ones if there are several.
     * Returns `undefined` if there are no build tasks, and rejects with a cancellation error if the user closes the picker.
     */
    protected async resolveDefaultBuildTask(context?: URI): Promise<string | undefined> {
        const configuredTasks = await this.taskService.getConfiguredTasks(this.taskService.startUserAction());
        const buildTasks = this.getBuildTasks(configuredTasks, context);
        const defaultTasks = buildTasks.filter(task => TaskCustomization.isDefaultBuildTask(task));
        if (defaultTasks.length === 1) {
            return this.taskNameResolver.resolve(defaultTasks[0]);
        }
        // Like VS Code, only offer the default build tasks if there are several of them
        const candidates = defaultTasks.length > 1 ? defaultTasks : buildTasks;
        if (candidates.length === 0) {
            return undefined;
        }
        const items: QuickPickValue<string>[] = candidates.map(task => {
            const name = this.taskNameResolver.resolve(task);
            return { label: name, detail: task.detail, value: name };
        });
        // Like the ${input:...} prompts, the picker stays open when it loses focus. Closing it (e.g. with Escape) cancels the launch
        const selected = await this.quickInputService?.showQuickPick(items, {
            placeholder: defaultTasks.length > 1
                ? nls.localizeByDefault('Select the build task to run')
                : nls.localizeByDefault('Select the build task (there is no default build task defined)'),
            ignoreFocusOut: true
        });
        if (!selected) {
            throw cancelled();
        }
        return selected.value;
    }

    /**
     * Returns the build tasks that a launch configuration in the given workspace folder can run:
     * the tasks of that folder, and the user and workspace tasks (see `TaskService.runWorkspaceTask`).
     */
    protected getBuildTasks(tasks: TaskConfiguration[], context?: URI): TaskConfiguration[] {
        const folder = context?.toString();
        return tasks.filter(task => TaskCustomization.isBuildTask(task) && (typeof task._scope !== 'string' || task._scope === folder));
    }
}
