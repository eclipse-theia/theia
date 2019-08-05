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
import { Disposable, DisposableCollection, ILogger } from '@theia/core/lib/common/';
import {
    TaskClient,
    TaskExitedEvent,
    TaskInfo,
    TaskServer,
    TaskConfiguration,
    TaskOutputProcessedEvent,
    RunTaskOption,
} from '../common';
import { TaskManager } from './task-manager';
import { TaskRunnerRegistry } from './task-runner';
import { Task } from './task';
import { ProcessTask } from './process/process-task';
import { ProblemCollector } from './task-problem-collector';

@injectable()
export class TaskServerImpl implements TaskServer, Disposable {

    /** Task clients, to send notifications-to. */
    protected clients: TaskClient[] = [];
    /** Map of task id and task disposable */
    protected readonly toDispose = new Map<number, DisposableCollection>();

    @inject(ILogger) @named('task')
    protected readonly logger: ILogger;

    @inject(TaskManager)
    protected readonly taskManager: TaskManager;

    @inject(TaskRunnerRegistry)
    protected readonly runnerRegistry: TaskRunnerRegistry;

    /** task context - {task id - problem collector} */
    private problemCollectors: Map<string, Map<number, ProblemCollector>> = new Map();

    dispose(): void {
        for (const toDispose of this.toDispose.values()) {
            toDispose.dispose();
        }
        this.toDispose.clear();
    }

    protected disposeByTaskId(taskId: number): void {
        if (this.toDispose.has(taskId)) {
            this.toDispose.get(taskId)!.dispose();
            this.toDispose.delete(taskId);
        }
    }

    async getTasks(context?: string): Promise<TaskInfo[]> {
        const taskInfo: TaskInfo[] = [];
        const tasks = this.taskManager.getTasks(context);
        if (tasks !== undefined) {
            for (const task of tasks) {
                taskInfo.push(await task.getRuntimeInfo());
            }
        }
        this.logger.debug(`getTasks(): about to return task information for ${taskInfo.length} tasks`);

        return Promise.resolve(taskInfo);
    }

    async run(taskConfiguration: TaskConfiguration, ctx?: string, option?: RunTaskOption): Promise<TaskInfo> {
        const runner = this.runnerRegistry.getRunner(taskConfiguration.type);
        const task = await runner.run(taskConfiguration, ctx);

        if (!this.toDispose.has(task.id)) {
            this.toDispose.set(task.id, new DisposableCollection());
        }
        this.toDispose.get(task.id)!.push(
            task.onExit(event => {
                this.taskManager.delete(task);
                this.fireTaskExitedEvent(event);
                this.removedCachedProblemCollector(event.ctx || '', event.taskId);
                this.disposeByTaskId(event.taskId);
            })
        );

        const resolvedMatchers = option && option.customization ? option.customization.problemMatcher || [] : [];
        if (resolvedMatchers.length > 0) {
            this.toDispose.get(task.id)!.push(
                task.onOutput(event => {
                    let collector: ProblemCollector | undefined = this.getCachedProblemCollector(event.ctx || '', event.taskId);
                    if (!collector) {
                        collector = new ProblemCollector(resolvedMatchers);
                        this.cacheProblemCollector(event.ctx || '', event.taskId, collector);
                    }

                    const problems = collector.processLine(event.line);
                    if (problems.length > 0) {
                        this.fireTaskOutputProcessedEvent({
                            taskId: event.taskId,
                            ctx: event.ctx,
                            problems
                        });
                    }
                })
            );
        }
        this.toDispose.get(task.id)!.push(task);

        const taskInfo = await task.getRuntimeInfo();
        this.fireTaskCreatedEvent(taskInfo);
        return taskInfo;
    }

    async getRegisteredTaskTypes(): Promise<string[]> {
        return this.runnerRegistry.getRunnerTypes();
    }

    protected fireTaskExitedEvent(event: TaskExitedEvent, task?: Task): void {
        this.logger.debug(log => log('task has exited:', event));

        this.clients.forEach(client => {
            client.onTaskExit(event);
        });

        if (task && task instanceof ProcessTask && task.processType === 'process') {
            this.clients.forEach(client => {
                client.onDidEndTaskProcess(event);
            });
        }
    }

    protected fireTaskCreatedEvent(event: TaskInfo, task?: Task): void {
        this.logger.debug(log => log('task created:', event));

        this.clients.forEach(client => {
            client.onTaskCreated(event);
        });

        if (task && task instanceof ProcessTask) {
            this.clients.forEach(client => {
                client.onDidStartTaskProcess(event);
            });
        }
    }

    protected fireTaskOutputProcessedEvent(event: TaskOutputProcessedEvent): void {
        this.clients.forEach(client => client.onDidProcessTaskOutput(event));
    }

    /** Kill task for a given id. Rejects if task is not found */
    async kill(id: number): Promise<void> {
        const taskToKill = this.taskManager.get(id);
        if (taskToKill !== undefined) {
            this.logger.info(`Killing task id ${id}`);
            return taskToKill.kill();
        } else {
            this.logger.info(`Could not find task to kill, task id ${id}. Already terminated?`);
            return Promise.reject(new Error(`Could not find task to kill, task id ${id}. Already terminated?`));
        }
    }

    /** Adds a client to this server */
    setClient(client: TaskClient): void {
        this.logger.debug('a client has connected - adding it to the list:');
        this.clients.push(client);
    }

    /** Removes a client, from this server */
    disconnectClient(client: TaskClient): void {
        this.logger.debug('a client has disconnected - removed from list:');
        const idx = this.clients.indexOf(client);
        if (idx > -1) {
            this.clients.splice(idx, 1);
        }
    }

    private getCachedProblemCollector(ctx: string, taskId: number): ProblemCollector | undefined {
        if (this.problemCollectors.has(ctx)) {
            return this.problemCollectors.get(ctx)!.get(taskId);
        }
    }

    private cacheProblemCollector(ctx: string, taskId: number, problemCollector: ProblemCollector): void {
        if (this.problemCollectors.has(ctx)) {
            if (!this.problemCollectors.get(ctx)!.has(taskId)) {
                this.problemCollectors.get(ctx)!.set(taskId, problemCollector);
            }
        } else {
            const forNewContext = new Map<number, ProblemCollector>();
            forNewContext.set(taskId, problemCollector);
            this.problemCollectors.set(ctx, forNewContext);
        }
    }

    private removedCachedProblemCollector(ctx: string, taskId: number): void {
        if (this.problemCollectors.has(ctx) && this.problemCollectors.get(ctx)!.has(taskId)) {
            this.problemCollectors.get(ctx)!.delete(taskId);
        }
    }
}
