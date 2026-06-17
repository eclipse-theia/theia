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

/**
 * Sentinel value returned (and accepted) as `workspaceRoot` for tasks defined
 * in the `.code-workspace` file rather than in a specific folder's `tasks.json`.
 */
export const WORKSPACE_SCOPE_TOKEN = '(workspace)';

/**
 * Sentinel value returned (and accepted) as `workspaceRoot` for user-level
 * global tasks that are not associated with any workspace or folder.
 */
export const GLOBAL_SCOPE_TOKEN = '(global)';

export interface TaskListEntry {
    /** The task label as defined in tasks.json or by a task provider */
    label: string;
    /**
     * Identifies where the task is defined:
     * - A root folder name (e.g. `"frontend"`) for folder-scoped tasks.
     * - `"(workspace)"` for tasks defined in the `.code-workspace` file.
     * - `"(global)"` for user-level global tasks.
     *
     * Pass this value back to `runTask`'s `workspaceRoot` parameter to
     * disambiguate when multiple tasks share the same label.
     */
    workspaceRoot?: string;
}

/**
 * Maps a task scope to the addressing token an agent should use.
 *
 * - Folder URI string → the workspace root name (e.g. `"frontend"`).
 * - `TaskScope.Workspace` → `"(workspace)"`.
 * - `TaskScope.Global` → `"(global)"`.
 *
 * If a folder URI cannot be resolved to a known root name, falls back to
 * `"(workspace)"` so the task remains addressable.
 */
export function resolveScopeToken(scope: string | TaskScope.Workspace | TaskScope.Global, workspaceScope: WorkspaceFunctionScope): string {
    if (scope === TaskScope.Workspace) {
        return WORKSPACE_SCOPE_TOKEN;
    }
    if (scope === TaskScope.Global) {
        return GLOBAL_SCOPE_TOKEN;
    }
    try {
        const uri = new URI(scope);
        return workspaceScope.getRootName(uri) ?? WORKSPACE_SCOPE_TOKEN;
    } catch {
        return WORKSPACE_SCOPE_TOKEN;
    }
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
                'of objects, each with a "label" (the task name) and a "workspaceRoot" (identifying where the task is defined). ' +
                'Use the filter parameter with an empty string "" to retrieve all tasks, or provide a substring ' +
                'to filter (e.g., "test" returns tasks containing "test" in the name). ' +
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
        entry.workspaceRoot = resolveScopeToken(task._scope, this.workspaceScope);
        return entry;
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
                        description: 'The workspaceRoot value as returned by listTasks. ' +
                            'Required when multiple tasks share the same label.'
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
                const filtered = this.filterByWorkspaceRoot(matchingTasks, args.workspaceRoot);
                if (typeof filtered === 'string') {
                    return filtered; // error message
                }
                if (filtered.length === 0) {
                    return `No task '${args.taskName}' found in workspace root '${args.workspaceRoot}'. `
                        + 'The task may be defined in a different root. Use listTasks to check.';
                }
                taskToRun = filtered[0];
            } else {
                const scopeTokens = matchingTasks.map(task => resolveScopeToken(task._scope, this.workspaceScope));
                return `Ambiguous task name '${args.taskName}' — found in multiple scopes: ${scopeTokens.join(', ')}. `
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

    /**
     * Filters tasks by the `workspaceRoot` addressing token the agent provided.
     *
     * Handles the sentinel values `(workspace)` and `(global)` as well as
     * normal folder-root names.
     *
     * @returns the filtered task array, or an error string if the root is unknown.
     */
    private filterByWorkspaceRoot(tasks: TaskConfiguration[], workspaceRoot: string): TaskConfiguration[] | string {
        if (workspaceRoot === WORKSPACE_SCOPE_TOKEN) {
            return tasks.filter(task => task._scope === TaskScope.Workspace);
        }
        if (workspaceRoot === GLOBAL_SCOPE_TOKEN) {
            return tasks.filter(task => task._scope === TaskScope.Global);
        }
        const rootMapping = this.workspaceScope.getRootMapping();
        const rootUri = rootMapping.get(workspaceRoot);
        if (!rootUri) {
            const availableRoots = Array.from(rootMapping.keys()).join(', ');
            return `Unknown workspace root '${workspaceRoot}'. Available roots: ${availableRoots}`;
        }
        const rootUriStr = rootUri.toString();
        return tasks.filter(
            task => typeof task._scope === 'string' && task._scope === rootUriStr
        );
    }
}
