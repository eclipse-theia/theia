// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { TaskService } from '@theia/task/lib/browser/task-service';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { MutableChatRequestModel } from '@theia/ai-chat';
import { CancellationToken } from '@theia/core';
import { LIST_TASKS_FUNCTION_ID, RUN_TASK_FUNCTION_ID } from '../common/workspace-functions';

@injectable()
export class TaskListProvider implements ToolProvider {

    @inject(TaskService)
    protected readonly taskService: TaskService;

    getTool(): ToolRequest {
        return {
            id: LIST_TASKS_FUNCTION_ID,
            name: LIST_TASKS_FUNCTION_ID,
            description: 'Lists available tool tasks in the workspace, such as build, run, test. Tasks can be filtered by name.',
            parameters: {
                type: 'object',
                properties: {
                    filter: {
                        type: 'string',
                        description: 'Filter to apply on task names (empty string to retrieve all tasks).'
                    }
                },
                required: ['filter']
            },
            handler: async (argString: string) => {
                const filterArgs: { filter: string } = JSON.parse(argString);
                const tasks = await this.getAvailableTasks(filterArgs.filter);
                const taskString = JSON.stringify(tasks);
                return taskString;
            }
        };
    }
    private async getAvailableTasks(filter: string = ''): Promise<string[]> {
        const userActionToken = this.taskService.startUserAction();
        const tasks = await this.taskService.getTasks(userActionToken);
        const filteredTasks = tasks.filter(task => task.label.toLowerCase().includes(filter.toLowerCase()));
        return filteredTasks.map(task => task.label);
    }
}

@injectable()
export class TaskRunnerProvider implements ToolProvider {

    @inject(TaskService)
    protected readonly taskService: TaskService;

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    getTool(): ToolRequest {
        return {
            id: RUN_TASK_FUNCTION_ID,
            name: RUN_TASK_FUNCTION_ID,
            description: 'Executes a specified task.',
            parameters: {
                type: 'object',
                properties: {
                    taskName: {
                        type: 'string',
                        description: 'The name of the task to execute.'
                    }
                },
                required: ['taskName']
            },
            handler: async (argString: string, ctx: MutableChatRequestModel) => this.handleRunTask(argString, ctx?.response?.cancellationToken)

        };
    }

    private async handleRunTask(argString: string, cancellationToken?: CancellationToken): Promise<string> {
        try {
            const args: { taskName: string } = JSON.parse(argString);

            const token = this.taskService.startUserAction();

            const taskInfo = await this.taskService.runTaskByLabel(token, args.taskName);
            if (!taskInfo) {
                return `Did not find a task for the label: '${args.taskName}'`;
            }
            cancellationToken?.onCancellationRequested(() => {
                this.taskService.terminateTask(taskInfo);
            });

            const signal = await this.taskService.getTerminateSignal(taskInfo.taskId);
            if (taskInfo.terminalId) {
                const terminal = this.terminalService.getByTerminalId(taskInfo.terminalId!);

                const length = terminal?.buffer.length ?? 0;
                const numberOfLines = Math.min(length, 50);
                const result: string[] = [];
                const allLines = terminal?.buffer.getLines(0, length).reverse() ?? [];

                // collect the first 50 lines:
                const firstLines = allLines.slice(0, numberOfLines);
                result.push(...firstLines);
                // collect the last 50 lines:
                if (length > numberOfLines) {
                    const lastLines = allLines.slice(length - numberOfLines);
                    result.push(...lastLines);
                }
                terminal?.clearOutput();
                return result.join('\n');
            }
            return `No terminal output available. The terminate signal was :${signal}.`;

        } catch (error) {
            return JSON.stringify({ success: false, message: error.message || 'Failed to run task' });
        }
    }
}

