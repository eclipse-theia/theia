/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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

import { inject, injectable, named } from 'inversify';
import { ILogger, ContributionProvider } from '@theia/core/lib/common';
import { QuickOpenTask } from './quick-open-task';
import { MAIN_MENU_BAR, CommandContribution, Command, CommandRegistry, MenuContribution, MenuModelRegistry } from '@theia/core/lib/common';
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { TaskContribution, TaskResolverRegistry, TaskProviderRegistry } from './task-contribution';

export namespace TaskCommands {
    // Task menu
    export const TASK_MENU = [...MAIN_MENU_BAR, '3_task'];
    export const TASK_MENU_RUN = [...TASK_MENU, '1_run'];
    export const TASK_MENU_LABEL = 'Task';

    // run task group
    export const TASK = [...MAIN_MENU_BAR, '3_task'];
    export const RUN_GROUP = [...TASK, '1_run'];

    // run task command
    export const TASK_RUN: Command = {
        id: 'task:run',
        label: 'Tasks: Run...'
    };

    export const TASK_ATTACH: Command = {
        id: 'task:attach',
        label: 'Tasks: Attach...'
    };
}

@injectable()
export class TaskFrontendContribution implements CommandContribution, MenuContribution, FrontendApplicationContribution {
    @inject(QuickOpenTask)
    protected readonly quickOpenTask: QuickOpenTask;

    @inject(FrontendApplication)
    protected readonly app: FrontendApplication;

    @inject(ILogger) @named('task')
    protected readonly logger: ILogger;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ContributionProvider) @named(TaskContribution)
    protected readonly contributionProvider: ContributionProvider<TaskContribution>;

    @inject(TaskProviderRegistry)
    protected readonly taskProviderRegistry: TaskProviderRegistry;

    @inject(TaskResolverRegistry)
    protected readonly taskResolverRegistry: TaskResolverRegistry;

    onStart(): void {
        this.contributionProvider.getContributions().forEach(contrib => {
            if (contrib.registerResolvers) {
                contrib.registerResolvers(this.taskResolverRegistry);
            }
            if (contrib.registerProviders) {
                contrib.registerProviders(this.taskProviderRegistry);
            }
        });
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(
            TaskCommands.TASK_RUN,
            {
                isEnabled: () => true,
                execute: () => this.quickOpenTask.open()
            }
        );
        registry.registerCommand(
            TaskCommands.TASK_ATTACH,
            {
                isEnabled: () => true,
                execute: () => this.quickOpenTask.attach()
            }
        );
    }

    registerMenus(menus: MenuModelRegistry): void {
        // Explicitly register the Task Submenu
        menus.registerSubmenu(TaskCommands.TASK_MENU, TaskCommands.TASK_MENU_LABEL);
        menus.registerMenuAction(TaskCommands.RUN_GROUP, {
            commandId: TaskCommands.TASK_RUN.id,
            label: TaskCommands.TASK_RUN.label ? TaskCommands.TASK_RUN.label.slice('Tasks: '.length) : TaskCommands.TASK_RUN.label,
            order: '0'
        });

        menus.registerMenuAction(TaskCommands.RUN_GROUP, {
            commandId: TaskCommands.TASK_ATTACH.id,
            label: TaskCommands.TASK_ATTACH.label ? TaskCommands.TASK_ATTACH.label.slice('Tasks: '.length) : TaskCommands.TASK_ATTACH.label,
            order: '1'
        });
    }
}
