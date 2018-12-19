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
import { CommandContribution, Command, CommandRegistry, MenuContribution, MenuModelRegistry } from '@theia/core/lib/common';
import { FrontendApplication, FrontendApplicationContribution, QuickOpenContribution, QuickOpenHandlerRegistry } from '@theia/core/lib/browser';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { TaskContribution, TaskResolverRegistry, TaskProviderRegistry } from './task-contribution';
import { TaskService } from './task-service';
import { TerminalMenus } from '@theia/terminal/lib/browser/terminal-frontend-contribution';

export namespace TaskCommands {
    const TASK_CATEGORY = 'Task';
    export const TASK_RUN: Command = {
        id: 'task:run',
        category: TASK_CATEGORY,
        label: 'Run Task...'
    };

    export const TASK_ATTACH: Command = {
        id: 'task:attach',
        category: TASK_CATEGORY,
        label: 'Attach Task...'
    };
}

@injectable()
export class TaskFrontendContribution implements CommandContribution, MenuContribution, FrontendApplicationContribution, QuickOpenContribution {
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

    @inject(TaskService)
    protected readonly taskService: TaskService;

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
                // tslint:disable-next-line:no-any
                execute: (...args: any[]) => {
                    let type: string | undefined;
                    let label: string | undefined;
                    if (args) {
                        [type, label] = args;
                    }
                    if (type && label) {
                        return this.taskService.run(type, label);
                    }
                    return this.quickOpenTask.open();
                }
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
        menus.registerMenuAction(TerminalMenus.TERMINAL_TASKS, {
            commandId: TaskCommands.TASK_RUN.id,
            order: '0'
        });

        menus.registerMenuAction(TerminalMenus.TERMINAL_TASKS, {
            commandId: TaskCommands.TASK_ATTACH.id,
            order: '1'
        });
    }

    registerQuickOpenHandlers(handlers: QuickOpenHandlerRegistry): void {
        handlers.registerHandler(this.quickOpenTask);
    }
}
