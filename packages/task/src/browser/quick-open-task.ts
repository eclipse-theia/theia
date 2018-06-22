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

import { inject, injectable } from "inversify";
import { TaskService } from './task-service';
import { TaskInfo } from '../common/task-protocol';
import { QuickOpenService, QuickOpenModel, QuickOpenItem, QuickOpenMode } from '@theia/core/lib/browser/quick-open/';

@injectable()
export class QuickOpenTask implements QuickOpenModel {

    protected items: QuickOpenItem[];

    constructor(
        @inject(TaskService) protected readonly taskService: TaskService,
        @inject(QuickOpenService) protected readonly quickOpenService: QuickOpenService
    ) { }

    open(): void {
        this.items = [];

        const tasks: string[] = this.taskService.getTasks();
        for (const task of tasks) {
            this.items.push(new TaskRunQuickOpenItem(task, this.taskService));
        }
        this.quickOpenService.open(this, {
            placeholder: 'Type the name of a task you want to execute',
            fuzzyMatchLabel: true,
            fuzzySort: true
        });
    }

    attach(): void {
        this.items = [];

        this.taskService.getRunningTasks().then(tasks => {
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

    public getItems(lookFor: string): QuickOpenItem[] {
        return this.items;
    }

    onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
        acceptor(this.items);
    }

    protected getRunningTaskLabel(task: TaskInfo): string {
        return `Task id: ${task.taskId}, label: ${task.label}`;
    }

}

export class TaskRunQuickOpenItem extends QuickOpenItem {

    constructor(
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
        this.taskService.run(this.taskLabel);

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
