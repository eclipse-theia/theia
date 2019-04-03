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

import { inject, injectable } from 'inversify';
import {
    QuickOpenService, QuickOpenModel, QuickOpenItem,
    QuickOpenGroupItem, QuickOpenMode, QuickOpenHandler, QuickOpenOptions, QuickOpenActionProvider
} from '@theia/core/lib/browser/quick-open/';
import { TaskService } from './task-service';
import { TaskInfo, TaskConfiguration } from '../common/task-protocol';
import { TaskConfigurations } from './task-configurations';
import URI from '@theia/core/lib/common/uri';
import { TaskActionProvider } from './task-action-provider';
import { LabelProvider } from '@theia/core/lib/browser';

@injectable()
export class QuickOpenTask implements QuickOpenModel, QuickOpenHandler {

    protected items: QuickOpenItem[];
    protected actionProvider: QuickOpenActionProvider | undefined;

    readonly prefix: string = 'task ';

    readonly description: string = 'Run Task';

    @inject(TaskService)
    protected readonly taskService: TaskService;

    @inject(QuickOpenService)
    protected readonly quickOpenService: QuickOpenService;

    @inject(TaskActionProvider)
    protected readonly taskActionProvider: TaskActionProvider;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    /**
     * @deprecated To be removed in 0.5.0
     */
    @inject(TaskConfigurations)
    protected readonly taskConfigurations: TaskConfigurations;

    /** Initialize this quick open model with the tasks. */
    async init(): Promise<void> {
        const configuredTasks = this.taskService.getConfiguredTasks();
        const providedTasks = await this.taskService.getProvidedTasks();

        const filteredProvidedTasks: TaskConfiguration[] = [];
        providedTasks.forEach(provided => {
            if (!configuredTasks.some(configured => configured.label === provided.label)) {
                filteredProvidedTasks.push(provided);
            }
        });

        this.items = [];
        this.items.push(
            ...configuredTasks.map((t, ind) => new TaskRunQuickOpenItem(t, this.taskService, true, ind === 0 ? 'configured tasks' : undefined)),
            ...filteredProvidedTasks.map((t, ind) => new TaskRunQuickOpenItem(t, this.taskService, false, ind === 0 ? 'detected tasks' : undefined))
        );

        this.actionProvider = this.items.length ? this.taskActionProvider : undefined;

        if (!this.items.length) {
            this.items.push(new QuickOpenItem({
                label: 'No tasks found',
                run: (mode: QuickOpenMode): boolean => false
            }));
        }
    }

    async open(): Promise<void> {
        await this.init();
        this.quickOpenService.open(this, {
            placeholder: 'Select the task to run',
            fuzzyMatchLabel: true,
            fuzzySort: false
        });
    }

    getModel(): QuickOpenModel {
        return this;
    }

    getOptions(): QuickOpenOptions {
        return {
            fuzzyMatchLabel: true,
            fuzzySort: false
        };
    }

    attach(): void {
        this.items = [];
        this.actionProvider = undefined;

        this.taskService.getRunningTasks().then(tasks => {
            if (!tasks.length) {
                this.items.push(new QuickOpenItem({
                    label: 'No tasks found',
                    run: (_mode: QuickOpenMode): boolean => false
                }));
            }
            for (const task of tasks) {
                // can only attach to terminal processes, so only list those
                if (task.terminalId) {
                    this.items.push(
                        new TaskAttachQuickOpenItem(
                            task,
                            this.getRunningTaskLabel(task),
                            this.taskService
                        )
                    );
                }
            }
            this.quickOpenService.open(this, {
                placeholder: 'Choose task to open',
                fuzzyMatchLabel: true,
                fuzzySort: true
            });
        });
    }

    async configure(): Promise<void> {
        this.items = [];
        this.actionProvider = undefined;

        const providedTasks = await this.taskService.getProvidedTasks();
        if (!providedTasks.length) {
            this.items.push(new QuickOpenItem({
                label: 'No tasks found',
                run: (_mode: QuickOpenMode): boolean => false
            }));
        }

        providedTasks.forEach(task => {
            this.items.push(new TaskConfigureQuickOpenItem(task, this.taskService, this.labelProvider));
        });

        this.quickOpenService.open(this, {
            placeholder: 'Select a task to configure',
            fuzzyMatchLabel: true,
            fuzzySort: true
        });
    }

    onType(lookFor: string, acceptor: (items: QuickOpenItem[], actionProvider?: QuickOpenActionProvider) => void): void {
        acceptor(this.items, this.actionProvider);
    }

    protected getRunningTaskLabel(task: TaskInfo): string {
        return `Task id: ${task.taskId}, label: ${task.config.label}`;
    }
}

export class TaskRunQuickOpenItem extends QuickOpenGroupItem {

    constructor(
        protected readonly task: TaskConfiguration,
        protected taskService: TaskService,
        protected readonly isConfigured: boolean,
        protected readonly groupLabel: string | undefined
    ) {
        super();
    }

    getTask(): TaskConfiguration {
        return this.task;
    }

    getLabel(): string {
        if (this.isConfigured) {
            return `${this.task.type}: ${this.task.label}`;
        }
        return `${this.task._source}: ${this.task.label}`;
    }

    getGroupLabel(): string {
        return this.groupLabel || '';
    }

    getDescription(): string {
        if (this.isConfigured) {
            return new URI(this.task._source).displayName;
        }
        if (this.task._scope) {
            return new URI(this.task._scope).path.toString();
        }
        return this.task._source;
    }

    run(mode: QuickOpenMode): boolean {
        if (mode !== QuickOpenMode.OPEN) {
            return false;
        }

        if (this.isConfigured) {
            this.taskService.runConfiguredTask(this.task._source, this.task.label);
        } else {
            this.taskService.run(this.task._source, this.task.label);
        }

        return true;
    }
}

export class TaskAttachQuickOpenItem extends QuickOpenItem {

    constructor(
        protected readonly task: TaskInfo,
        protected readonly taskLabel: string,
        protected taskService: TaskService
    ) {
        super();
    }

    getLabel(): string {
        return this.taskLabel!;
    }

    run(mode: QuickOpenMode): boolean {
        if (mode !== QuickOpenMode.OPEN) {
            return false;
        }
        if (this.task.terminalId) {
            this.taskService.attach(this.task.terminalId, this.task.taskId);
        }
        return true;
    }
}
export class TaskConfigureQuickOpenItem extends QuickOpenGroupItem {

    constructor(
        protected readonly task: TaskConfiguration,
        protected readonly taskService: TaskService,
        protected readonly labelProvider: LabelProvider
    ) {
        super();
    }

    getLabel(): string {
        return `${this.task._source}: ${this.task.label}`;
    }

    getDescription(): string {
        if (this.task._scope) {
            return this.labelProvider.getLongName(new URI(this.task._scope));
        }
        return this.task._source;
    }

    run(mode: QuickOpenMode): boolean {
        if (mode !== QuickOpenMode.OPEN) {
            return false;
        }
        this.taskService.configure(this.task);

        return true;
    }
}
