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

export { TODO_WRITE_FUNCTION_ID, TodoItem, isValidTodoItem } from '../common/todo-tool';

@injectable()
export class TodoWriteTool implements ToolProvider {
    static ID = TODO_WRITE_FUNCTION_ID;

    getTool(): ToolRequest {
        return {
            id: TodoWriteTool.ID,
            name: TodoWriteTool.ID,
            providerName: 'ai-ide',
            description: 'Write a todo list to track task progress. Use this to plan multi-step tasks ' +
                'and show progress to the user. Each todo has content (imperative: "Run tests"), ' +
                'activeForm (continuous: "Running tests"), and status (pending/in_progress/completed). ' +
                'Call this to update the entire list - it replaces the previous list.',
            parameters: {
                type: 'object',
                properties: {
                    todos: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                content: { type: 'string', description: 'Imperative form: "Run tests"' },
                                activeForm: { type: 'string', description: 'Continuous form: "Running tests"' },
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
                    if (invalidCount > 0) {
                        return JSON.stringify({
                            success: true,
                            count: validTodos.length,
                            warning: `${invalidCount} invalid todo item(s) were filtered out`
                        });
                    }
                    return JSON.stringify({ success: true, count: validTodos.length });
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    return JSON.stringify({ error: `Failed to parse todos: ${message}` });
                }
            }
        };
    }
}
