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
import { Emitter, Event, ILogger } from '@theia/core/lib/common';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { Task } from './task';

// inspired by process-manager.ts

@injectable()
export class TaskManager implements BackendApplicationContribution {

    /** contains all running tasks */
    protected readonly tasks: Map<number, Task> = new Map();
    /** contains running tasks per context */
    protected readonly tasksPerCtx: Map<string, Task[]> = new Map();
    /** each task has this unique task id, for this back-end */
    protected id: number = -1;
    protected readonly deleteEmitter = new Emitter<number>();

    constructor(
        @inject(ILogger) @named('task') protected readonly logger: ILogger
    ) { }

    register(task: Task, ctx?: string): number {
        const id = ++this.id;
        this.tasks.set(id, task);

        if (ctx) {
            let tks = this.tasksPerCtx.get(ctx);
            if (tks === undefined) {
                tks = [];
            }
            tks.push(task);
            this.tasksPerCtx.set(ctx, tks);
        }

        return id;
    }

    get(id: number): Task | undefined {
        return this.tasks.get(id);
    }

    /**
     * Returns all running tasks. If a context is provided, filter-down to
     * only tasks started from that context
     */
    getTasks(ctx?: string): Task[] | undefined {
        if (!ctx) {
            return [...this.tasks.values()];
        } else {
            if (this.tasksPerCtx.has(ctx)) {
                return this.tasksPerCtx.get(ctx);
            }
        }
    }

    /** Deletes a task from the task manager */
    delete(task: Task): void {
        this.tasks.delete(task.id);

        const ctx = task.context;
        if (ctx && this.tasksPerCtx.has(ctx)) {
            const tasksForWS = this.tasksPerCtx.get(ctx);
            if (tasksForWS !== undefined) {
                const idx = tasksForWS.indexOf(task);
                tasksForWS.splice(idx, 1);
            }
        }
        this.deleteEmitter.fire(task.id);
    }

    get onDelete(): Event<number> {
        return this.deleteEmitter.event;
    }

    /** When the application stops, clean-up all ongoing tasks */
    onStop(): void {
        this.tasks.forEach((task: Task, id: number) => {
            this.logger.debug(`Task Backend application: onStop(): cleaning task id: ${id}`);
            this.delete(task);
        });
    }
}
