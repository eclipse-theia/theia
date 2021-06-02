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

import { injectable } from '@theia/core/shared/inversify';
import { ILogger, Disposable, DisposableCollection, Emitter, Event, MaybePromise } from '@theia/core/lib/common/';
import { TaskManager } from './task-manager';
import { TaskInfo, TaskExitedEvent, TaskConfiguration, TaskOutputEvent } from '../common/task-protocol';
/**
 * Represents the options used for running a task.
 */
export interface TaskOptions {
    /** The task label */
    label: string;
    /** The task configuration which should be executed */
    config: TaskConfiguration;
    /** The optional execution context */
    context?: string;
}

/**
 * A {@link Task} represents the execution state of a `TaskConfiguration`.
 * Implementing classes have to call the {@link Task#fireOutputLine} function
 * whenever a new output occurs during the execution.
 */
@injectable()
export abstract class Task implements Disposable {

    protected taskId: number;
    protected readonly toDispose: DisposableCollection = new DisposableCollection();
    readonly exitEmitter: Emitter<TaskExitedEvent>;
    readonly outputEmitter: Emitter<TaskOutputEvent>;

    constructor(
        protected readonly taskManager: TaskManager,
        protected readonly logger: ILogger,
        protected readonly options: TaskOptions
    ) {
        this.taskId = this.taskManager.register(this, this.options.context);
        this.exitEmitter = new Emitter<TaskExitedEvent>();
        this.outputEmitter = new Emitter<TaskOutputEvent>();
        this.toDispose.push(this.exitEmitter);
        this.toDispose.push(this.outputEmitter);
    }

    /**
     * Terminate this task.
     *
     * @returns a promise that resolves once the task has been properly terminated.
     */
    abstract kill(): Promise<void>;

    get onExit(): Event<TaskExitedEvent> {
        return this.exitEmitter.event;
    }

    get onOutput(): Event<TaskOutputEvent> {
        return this.outputEmitter.event;
    }

    /** Has to be called when a task has concluded its execution. */
    protected fireTaskExited(event: TaskExitedEvent): void {
        this.exitEmitter.fire(event);
    }

    protected fireOutputLine(event: TaskOutputEvent): void {
        this.outputEmitter.fire(event);
    }
    /**
     * Retrieves the runtime information about this task.
     * The runtime information computation may happen asynchronous.
     *
     * @returns (a promise of) the runtime information as `TaskInfo`.
     */
    abstract getRuntimeInfo(): MaybePromise<TaskInfo>;

    get id(): number {
        return this.taskId;
    }

    get context(): string | undefined {
        return this.options.context;
    }

    get label(): string {
        return this.options.label;
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}
