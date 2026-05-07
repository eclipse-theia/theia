// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { injectable } from '@theia/core/shared/inversify';
import { ToolProvider, ToolRequest } from '@theia/ai-core/lib/common';
import { TODO_WRITE_FUNCTION_ID, isValidTodoItem } from '../common/todo-tool';

@injectable()
export class TodoWriteTool implements ToolProvider {
    static ID = TODO_WRITE_FUNCTION_ID;

    getTool(): ToolRequest {
        return {
            id: TodoWriteTool.ID,
            name: TodoWriteTool.ID,
            providerName: 'ai-ide',
            description: 'Create or replace a structured task list for the current session. ' +
                'This helps you track progress, organize complex tasks, and demonstrate thoroughness to the user. ' +
                'It also helps the user understand the progress and overall status of their requests.\n\n' +
                'When to use:\n' +
                '- Tasks requiring 3+ steps or careful planning\n' +
                '- User provides multiple tasks or explicitly requests a todo list\n' +
                '- After receiving new instructions — immediately capture requirements as todos\n' +
                'Skip for single, trivial tasks, conversational or informational requests that need no tracking.\n' +
                'When in doubt, use this tool.\n\n' +
                'Task states:\n' +
                '- pending: Task not yet started\n' +
                '- in_progress: Currently working on (limit to ONE task at a time)\n' +
                '- completed: Task finished successfully\n\n' +
                'Task management:\n' +
                '- Mark a task in_progress BEFORE starting work on it (one at a time)\n' +
                '- Complete the current task before starting new ones\n' +
                '- Mark tasks completed immediately after finishing — do not batch completions\n' +
                '- Only mark completed when fully accomplished (no failing tests, no partial implementation, no unresolved errors)\n' +
                '- If blocked, add a new task describing what needs to be resolved\n' +
                '- Add follow-up tasks discovered during implementation\n' +
                '- Remove tasks that are no longer relevant\n\n' +
                'Task breakdown:\n' +
                '- Create specific, actionable items\n' +
                '- Break complex tasks into smaller, manageable steps\n' +
                '- Use clear, descriptive task names\n\n' +
                'Being proactive with task management demonstrates attentiveness and ensures you complete all requirements successfully.',
            parameters: {
                type: 'object',
                properties: {
                    todos: {
                        type: 'array',
                        description: 'The updated todo list.',
                        items: {
                            type: 'object',
                            properties: {
                                content: { type: 'string', description: 'Clear, actionable task description (e.g., "Extract TokenValidator from AuthService").' },
                                activeForm: { type: 'string', description: 'Continuous form shown during execution (e.g., "Extracting TokenValidator from AuthService").' },
                                status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] }
                            },
                            required: ['content', 'activeForm', 'status']
                        }
                    }
                },
                required: ['todos']
            },
            handler: async (arg_string: string) => {
                try {
                    const { todos } = JSON.parse(arg_string);
                    if (!Array.isArray(todos)) {
                        return JSON.stringify({ error: 'todos must be an array' });
                    }
                    const validTodos = todos.filter(isValidTodoItem);
                    const invalidCount = todos.length - validTodos.length;
                    const response: Record<string, unknown> = {
                        success: true,
                        count: validTodos.length,
                    };
                    if (invalidCount > 0) {
                        response.warning = `${invalidCount} invalid todo item(s) were filtered out`;
                    }
                    return JSON.stringify(response);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    return JSON.stringify({ error: `Failed to parse todos: ${message}` });
                }
            }
        };
    }
}
