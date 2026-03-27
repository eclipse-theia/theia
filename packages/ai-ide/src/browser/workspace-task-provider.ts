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

import { ToolInvocationContext, ToolProvider, ToolRequest } from '@theia/ai-core';
import { CancellationToken } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { TaskService } from '@theia/task/lib/browser/task-service';
import { TaskConfiguration, TaskScope } from '@theia/task/lib/common/task-protocol';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { LIST_TASKS_FUNCTION_ID, RUN_TASK_FUNCTION_ID } from '../common/workspace-functions';
import { WorkspaceFunctionScope } from './workspace-functions';

import URI from '@theia/core/lib/common/uri';

export interface TaskListEntry {
    /** The task label as defined in tasks.json or by a task provider */
    label: string;
    /** The workspace root name this task belongs to, or undefined for global/workspace-scoped tasks */
    workspaceRoot?: string;
}

@injectable()
export class TaskListProvider implements ToolProvider {

    @inject(TaskService)
    protected readonly taskService: TaskService;

    @inject(WorkspaceFunctionScope)
    protected readonly workspaceScope: WorkspaceFunctionScope;

    getTool(): ToolRequest {
        return {
            id: LIST_TASKS_FUNCTION_ID,
            name: LIST_TASKS_FUNCTION_ID,
            description: 'Lists available tasks in the workspace that can be executed with runTask. Returns an array ' +
                'of objects, each with a "label" (the task name) and optionally a "workspaceRoot" (the root name the task belongs to). ' +
                'Use the filter parameter with an empty string "" to retrieve all tasks, or provide a substring ' +
                'to filter (e.g., "test" returns tasks containing "test" in the name). ' +
                'Example return: [{"label": "npm: build", "workspaceRoot": "frontend"}, {"label": "npm: test", "workspaceRoot": "backend"}]. ' +
                'Always call this before runTask to discover exact task names and their workspace roots.',
            parameters: {
                type: 'object',
                properties: {
                    filter: {
                        type: 'string',
                        description: 'Substring filter for task names. Use "" (empty string) to retrieve all tasks, ' +
                            'or a keyword like "build", "test", "lint" to filter results.'
                    }
                },
                required: ['filter']
            },
            handler: async (argString: string, ctx?: ToolInvocationContext) => {
                if (ctx?.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }
                const filterArgs: { filter: string } = JSON.parse(argString);
                const tasks = await this.getAvailableTasks(filterArgs.filter);
                return JSON.stringify(tasks);
            }
        };
    }

    private async getAvailableTasks(filter: string = ''): Promise<TaskListEntry[]> {
        const userActionToken = this.taskService.startUserAction();
        const tasks = await this.taskService.getTasks(userActionToken);
        const filteredTasks = tasks.filter(task => task.label.toLowerCase().includes(filter.toLowerCase()));
        return filteredTasks.map(task => this.toTaskListEntry(task));
    }

    private toTaskListEntry(task: TaskConfiguration): TaskListEntry {
        const entry: TaskListEntry = { label: task.label };
        const rootName = this.resolveRootName(task._scope);
        if (rootName) {
            entry.workspaceRoot = rootName;
        }
        return entry;
    }

    private resolveRootName(scope: string | TaskScope.Workspace | TaskScope.Global): string | undefined {
        if (typeof scope !== 'string') {
            return undefined;
        }
        try {
            const uri = new URI(scope);
            return this.workspaceScope.getRootName(uri);
        } catch {
            return undefined;
        }
    }
}

@injectable()
export class TaskRunnerProvider implements ToolProvider {

    @inject(TaskService)
    protected readonly taskService: TaskService;

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    @inject(WorkspaceFunctionScope)
    protected readonly workspaceScope: WorkspaceFunctionScope;

    getTool(): ToolRequest {
        return {
            id: RUN_TASK_FUNCTION_ID,
            name: RUN_TASK_FUNCTION_ID,
            description: 'Executes a specified task by name and waits for completion. Returns the terminal output ' +
                '(first and last 50 lines if output exceeds this limit). The task must exist in the workspace ' +
                '(use listTasks to discover available tasks). Common task types include: build tasks ' +
                '(e.g., "npm: build"), test tasks (e.g., "npm: test"), and lint tasks (e.g., "npm: lint"). ' +
                'If the task fails, the error output is included in the response. Tasks may take significant ' +
                'time to complete (builds can take minutes). The operation can be cancelled by the user. ' +
                'If multiple tasks share the same label, specify the workspaceRoot parameter to disambiguate. ' +
                'Do NOT use this for tasks you haven\'t discovered via listTasks first.',
            parameters: {
                type: 'object',
                properties: {
                    taskName: {
                        type: 'string',
                        description: 'The exact name/label of the task to execute, as returned by listTasks.'
                    },
                    workspaceRoot: {
                        type: 'string',
                        description: 'The workspace root name the task belongs to (as returned by listTasks). ' +
                            'Required when multiple tasks share the same label across different workspace roots.'
                    }
                },
                required: ['taskName']
            },
            handler: async (argString: string, ctx?: ToolInvocationContext) => this.handleRunTask(argString, ctx?.cancellationToken)

        };
    }

    private async handleRunTask(argString: string, cancellationToken?: CancellationToken): Promise<string> {
        try {
            const args: { taskName: string; workspaceRoot?: string } = JSON.parse(argString);

            const token = this.taskService.startUserAction();
            const allTasks = await this.taskService.getTasks(token);

            const matchingTasks = allTasks.filter(task => task.label === args.taskName);

            if (matchingTasks.length === 0) {
                return `Did not find a task for the label: '${args.taskName}'`;
            }

            let taskToRun: TaskConfiguration;

            if (matchingTasks.length === 1) {
                taskToRun = matchingTasks[0];
            } else if (args.workspaceRoot) {
                const rootMapping = this.workspaceScope.getRootMapping();
                const rootUri = rootMapping.get(args.workspaceRoot);
                if (!rootUri) {
                    const availableRoots = Array.from(rootMapping.keys()).join(', ');
                    return `Unknown workspace root '${args.workspaceRoot}'. Available roots: ${availableRoots}`;
                }
                const rootUriStr = rootUri.toString();
                const filtered = matchingTasks.filter(
                    task => typeof task._scope === 'string' && task._scope === rootUriStr
                );
                if (filtered.length === 0) {
                    return `No task '${args.taskName}' found in workspace root '${args.workspaceRoot}'. `
                        + 'The task may be defined in a different root. Use listTasks to check.';
                }
                taskToRun = filtered[0];
            } else {
                const rootNames = matchingTasks.map(task => {
                    if (typeof task._scope === 'string') {
                        try {
                            const name = this.workspaceScope.getRootName(new URI(task._scope));
                            return name ?? '(unknown)';
                        } catch {
                            return '(unknown)';
                        }
                    }
                    return '(global)';
                });
                return `Ambiguous task name '${args.taskName}' — found in multiple workspace roots: ${rootNames.join(', ')}. `
                    + 'Please specify the workspaceRoot parameter to disambiguate.';
            }

            const taskInfo = await this.taskService.runTask(taskToRun);
            if (!taskInfo) {
                return `Did not find a task for the label: '${args.taskName}'`;
            }
            cancellationToken?.onCancellationRequested(() => {
                // Only terminate if the task is still running
                if (this.taskService.isTaskRunning(taskInfo.taskId)) {
                    this.taskService.terminateTask(taskInfo);
                }
            });
            if (cancellationToken?.isCancellationRequested) {
                return JSON.stringify({ error: 'Operation cancelled by user' });
            }
            const signal = await this.taskService.getTerminateSignal(taskInfo.taskId);
            if (taskInfo.terminalId) {
                const terminal = this.terminalService.getByTerminalId(taskInfo.terminalId!);

                const length = terminal?.buffer.length ?? 0;
                const numberOfLines = Math.min(length, 50);
                const result: string[] = [];
                const allLines = terminal?.buffer.getLines(0, length) ?? [];

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
