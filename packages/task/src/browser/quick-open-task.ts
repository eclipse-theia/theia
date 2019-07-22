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
    QuickOpenGroupItem, QuickOpenMode, QuickOpenHandler, QuickOpenOptions, QuickOpenActionProvider, QuickOpenGroupItemOptions
} from '@theia/core/lib/browser/quick-open/';
import { TaskService } from './task-service';
import { ContributedTaskConfiguration, TaskInfo, TaskConfiguration } from '../common/task-protocol';
import { TaskConfigurations } from './task-configurations';
import URI from '@theia/core/lib/common/uri';
import { TaskActionProvider } from './task-action-provider';
import { LabelProvider } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';

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

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    /**
     * @deprecated To be removed in 0.5.0
     */
    @inject(TaskConfigurations)
    protected readonly taskConfigurations: TaskConfigurations;

    /** Initialize this quick open model with the tasks. */
    async init(): Promise<void> {
        const recentTasks = this.taskService.recentTasks;
        const configuredTasks = this.taskService.getConfiguredTasks();
        const providedTasks = await this.taskService.getProvidedTasks();

        const { filteredRecentTasks, filteredConfiguredTasks, filteredProvidedTasks } = this.getFilteredTasks(recentTasks, configuredTasks, providedTasks);
        const stat = this.workspaceService.workspace;
        const isMulti = stat ? !stat.isDirectory : false;
        this.items = [];
        this.items.push(
            ...filteredRecentTasks.map((task, index) =>
                new TaskRunQuickOpenItem(task, this.taskService, isMulti, {
                    groupLabel: index === 0 ? 'recently used tasks' : undefined,
                    showBorder: false
                })),
            ...filteredConfiguredTasks.map((task, index) =>
                new TaskRunQuickOpenItem(task, this.taskService, isMulti, {
                    groupLabel: index === 0 ? 'configured tasks' : undefined,
                    showBorder: (
                        filteredRecentTasks.length <= 0
                            ? false
                            : index === 0 ? true : false
                    )
                })),
            ...filteredProvidedTasks.map((task, index) =>
                new TaskRunQuickOpenItem(task, this.taskService, isMulti, {
                    groupLabel: index === 0 ? 'detected tasks' : undefined,
                    showBorder: (
                        filteredRecentTasks.length <= 0 && filteredConfiguredTasks.length <= 0
                            ? false
                            : index === 0 ? true : false
                    )
                }))
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

    private getFilteredTasks(recentTasks: TaskConfiguration[], configuredTasks: TaskConfiguration[], providedTasks: TaskConfiguration[])
        : { filteredRecentTasks: TaskConfiguration[], filteredConfiguredTasks: TaskConfiguration[], filteredProvidedTasks: TaskConfiguration[] } {

        const filteredRecentTasks: TaskConfiguration[] = [];
        for (const recent of recentTasks) {
            const candidate = this.findBySourceAndLabel(recent.source, recent.label, configuredTasks) ||
                [...configuredTasks, ...providedTasks].find(task => TaskConfiguration.equals(recent, task));

            if (candidate && !filteredRecentTasks.some(task => TaskConfiguration.equals(candidate, task))) {
                filteredRecentTasks.push(candidate);
            }
        }

        const filteredProvidedTasks: TaskConfiguration[] = [];
        providedTasks.forEach(provided => {
            const exist = filteredRecentTasks.some(task =>
                TaskConfiguration.equals(provided, task)) || this.findBySourceAndLabel(provided.source, provided.label, configuredTasks);
            if (!exist) {
                filteredProvidedTasks.push(provided);
            }
        });

        const filteredConfiguredTasks: TaskConfiguration[] = [];
        configuredTasks.forEach(configured => {
            const exist = filteredRecentTasks.some(t => TaskConfiguration.equals(configured, t));
            if (!exist) {
                filteredConfiguredTasks.push(configured);
            }
        });

        return {
            filteredRecentTasks, filteredConfiguredTasks, filteredProvidedTasks
        };
    }

    private findBySourceAndLabel(source: string, label: string, tasks: TaskConfiguration[]): TaskConfiguration | undefined {
        return tasks.find(task => !!source && source === task.source && label === task.label);
    }
}

export class TaskRunQuickOpenItem extends QuickOpenGroupItem {

    constructor(
        protected readonly task: TaskConfiguration,
        protected taskService: TaskService,
        protected isMulti: boolean,
        protected readonly options: QuickOpenGroupItemOptions,
    ) {
        super(options);
    }

    getTask(): TaskConfiguration {
        return this.task;
    }

    getLabel(): string {
        if (this.task.source) {
            return `${this.task.source}: ${this.task.label}`;
        }
        return `${this.task.type}: ${this.task.label}`;
    }

    getGroupLabel(): string {
        return this.options.groupLabel || '';
    }

    getDescription(): string {
        if (!this.isMulti) {
            return '';
        }
        if (ContributedTaskConfiguration.is(this.task)) {
            if (this.task._scope) {
                return new URI(this.task._scope).displayName;
            }
            return this.task._source;
        } else {
            return new URI(this.task._source).displayName;
        }

    }

    run(mode: QuickOpenMode): boolean {
        if (mode !== QuickOpenMode.OPEN) {
            return false;
        }

        if (ContributedTaskConfiguration.is(this.task)) {
            this.taskService.run(this.task._source, this.task.label);
        } else {
            this.taskService.runConfiguredTask(this.task._source, this.task.label);
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
            return new URI(this.task._scope).displayName;
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

@injectable()
export class TaskTerminateQuickOpen implements QuickOpenModel {

    @inject(QuickOpenService)
    protected readonly quickOpenService: QuickOpenService;

    @inject(TaskService)
    protected readonly taskService: TaskService;

    async onType(_lookFor: string, acceptor: (items: QuickOpenItem[]) => void): Promise<void> {
        const items: QuickOpenItem[] = [];
        const runningTasks: TaskInfo[] = await this.taskService.getRunningTasks();
        if (runningTasks.length <= 0) {
            items.push(new QuickOpenItem({
                label: 'No task is currently running',
                run: (): boolean => false,
            }));
        } else {
            runningTasks.forEach((task: TaskInfo) => {
                items.push(new QuickOpenItem({
                    label: task.config.label,
                    run: (mode: QuickOpenMode): boolean => {
                        if (mode !== QuickOpenMode.OPEN) {
                            return false;
                        }
                        this.taskService.kill(task.taskId);
                        return true;
                    }
                }));
            });
            if (runningTasks.length > 1) {
                items.push(new QuickOpenItem({
                    label: 'All running tasks',
                    run: (mode: QuickOpenMode): boolean => {
                        if (mode !== QuickOpenMode.OPEN) {
                            return false;
                        }
                        runningTasks.forEach((t: TaskInfo) => {
                            this.taskService.kill(t.taskId);
                        });
                        return true;
                    }
                }));
            }
        }
        acceptor(items);
    }

    async open(): Promise<void> {
        this.quickOpenService.open(this, {
            placeholder: 'Select task to terminate',
            fuzzyMatchLabel: true,
            fuzzyMatchDescription: true,
        });
    }

}

@injectable()
export class TaskRunningQuickOpen implements QuickOpenModel {

    @inject(QuickOpenService)
    protected readonly quickOpenService: QuickOpenService;

    @inject(TaskService)
    protected readonly taskService: TaskService;

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    async onType(_lookFor: string, acceptor: (items: QuickOpenItem[]) => void): Promise<void> {
        const items: QuickOpenItem[] = [];
        const runningTasks: TaskInfo[] = await this.taskService.getRunningTasks();
        if (runningTasks.length <= 0) {
            items.push(new QuickOpenItem({
                label: 'No task is currently running',
                run: (): boolean => false,
            }));
        } else {
            runningTasks.forEach((task: TaskInfo) => {
                items.push(new QuickOpenItem({
                    label: task.config.label,
                    run: (mode: QuickOpenMode): boolean => {
                        if (mode !== QuickOpenMode.OPEN) {
                            return false;
                        }
                        if (task.terminalId) {
                            const terminal = this.terminalService.getById('terminal-' + task.terminalId);
                            if (terminal) {
                                this.terminalService.open(terminal);
                            }
                        }
                        return true;
                    }
                }));
            });
        }
        acceptor(items);
    }

    async open(): Promise<void> {
        this.quickOpenService.open(this, {
            placeholder: 'Select the task to show its output',
            fuzzyMatchLabel: true,
            fuzzyMatchDescription: true,
        });
    }
}
