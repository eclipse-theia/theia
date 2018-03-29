/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, named } from "inversify";
import { ILogger } from '@theia/core/lib/common';
import { QuickOpenTask } from './quick-open-task';
import { MAIN_MENU_BAR, CommandContribution, Command, CommandRegistry, MenuContribution, MenuModelRegistry } from '@theia/core/lib/common';
import { FrontendApplication } from '@theia/core/lib/browser';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';

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
export class TaskFrontendContribution implements CommandContribution, MenuContribution {

    constructor(
        @inject(QuickOpenTask) protected readonly quickOpenTask: QuickOpenTask,
        @inject(FrontendApplication) protected readonly app: FrontendApplication,
        @inject(ILogger) @named('task') protected readonly logger: ILogger,
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager
    ) { }

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
