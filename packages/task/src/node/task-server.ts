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
import { ILogger } from '@theia/core/lib/common/';
import { TaskClient, TaskExitedEvent, TaskInfo, TaskServer, TaskConfiguration } from '../common/task-protocol';
import { TaskManager } from './task-manager';
import { TaskRunnerRegistry } from './task-runner';

@injectable()
export class TaskServerImpl implements TaskServer {

    /** Task clients, to send notifications-to. */
    protected clients: TaskClient[] = [];

    @inject(ILogger) @named('task')
    protected readonly logger: ILogger;

    @inject(TaskManager)
    protected readonly taskManager: TaskManager;

    @inject(TaskRunnerRegistry)
    protected readonly runnerRegistry: TaskRunnerRegistry;

    dispose() {
        // do nothing
    }

    async getTasks(context?: string | undefined): Promise<TaskInfo[]> {
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

    async run(taskConfiguration: TaskConfiguration, ctx?: string): Promise<TaskInfo> {
        const runner = this.runnerRegistry.getRunner(taskConfiguration.type);
        const task = await runner.run(taskConfiguration, ctx);

        task.onExit(event => {
            this.taskManager.delete(task);
            this.fireTaskExitedEvent(event);
        });

        const taskInfo = await task.getRuntimeInfo();
        this.fireTaskCreatedEvent(taskInfo);
        return taskInfo;
    }

    protected fireTaskExitedEvent(event: TaskExitedEvent) {
        this.logger.debug(log => log('task has exited:', event));

        this.clients.forEach(client => {
            client.onTaskExit(event);
        });
    }

    protected fireTaskCreatedEvent(event: TaskInfo) {
        this.logger.debug(log => log('task created:', event));

        this.clients.forEach(client => {
            client.onTaskCreated(event);
        });
    }

    /** Kill task for a given id. Rejects if task is not found */
    async kill(id: number): Promise<void> {
        const taskToKill = this.taskManager.get(id);
        if (taskToKill !== undefined) {
            this.logger.info(`Killing task id ${id}`);
            return taskToKill.kill();
        } else {
            this.logger.info(`Could not find task to kill, task id ${id}. Already terminated?`);
            return Promise.reject(`Could not find task to kill, task id ${id}. Already terminated?`);
        }
    }

    /** Adds a client to this server */
    setClient(client: TaskClient) {
        this.logger.debug('a client has connected - adding it to the list:');
        this.clients.push(client);
    }

    /** Removes a client, from this server */
    disconnectClient(client: TaskClient) {
        this.logger.debug('a client has disconnected - removed from list:');
        const idx = this.clients.indexOf(client);
        if (idx > -1) {
            this.clients.splice(idx, 1);
        }
    }
}
