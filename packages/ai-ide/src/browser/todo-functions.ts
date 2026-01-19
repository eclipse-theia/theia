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

import { MutableChatRequestModel, TodoItemState } from '@theia/ai-chat';
import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { injectable } from '@theia/core/shared/inversify';
import { TODO_READ_FUNCTION_ID, TODO_WRITE_FUNCTION_ID } from '../common/todo-functions';

interface TodoWriteInput {
    content: string;
    state: TodoItemState;
    notes?: string;
}

interface TodoWriteArgs {
    todos: TodoWriteInput[];
}

@injectable()
export class TodoWriteToolProvider implements ToolProvider {
    static ID = TODO_WRITE_FUNCTION_ID;

    getTool(): ToolRequest {
        return {
            id: TodoWriteToolProvider.ID,
            name: TodoWriteToolProvider.ID,
            description: 'Manages a structured task list for the current chat session. ' +
                'IMPORTANT: Always call todoRead first to see the current state before updating, to avoid accidentally removing items. ' +
                'Use this tool to track progress on multi-step tasks and give the user visibility into your work. ' +
                'The entire todo list is replaced with each call - provide the complete updated list each time. ' +
                'Each todo item has: content (what needs to be done), state ("pending" or "completed"), and optional notes. ' +
                'Mark tasks as completed immediately after finishing them. ' +
                'Use this tool proactively for complex tasks requiring 3+ steps.',
            parameters: {
                type: 'object',
                properties: {
                    todos: {
                        type: 'array',
                        description: 'The complete updated todo list. Each item must have content, state, and optionally notes.',
                        items: {
                            type: 'object',
                            properties: {
                                content: {
                                    type: 'string',
                                    description: 'Short description of the task (e.g., "Fix type errors in auth module")'
                                },
                                state: {
                                    type: 'string',
                                    enum: ['pending', 'completed'],
                                    description: 'Task state: "pending" for incomplete tasks, "completed" for finished tasks'
                                },
                                notes: {
                                    type: 'string',
                                    description: 'Optional additional details or notes about the task'
                                }
                            },
                            required: ['content', 'state']
                        }
                    }
                },
                required: ['todos']
            },
            handler: async (args: string, ctx: MutableChatRequestModel): Promise<string> => {
                if (ctx?.response?.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }

                const { todos } = JSON.parse(args) as TodoWriteArgs;
                const todoList = ctx.session.todoList;

                todoList.clear();

                const addedItems: Array<{ id: string; content: string; state: TodoItemState }> = [];

                for (const todo of todos) {
                    const item = todoList.addItem(todo.content, todo.notes);
                    if (todo.state === 'completed') {
                        todoList.updateItem(item.id, { state: 'completed' });
                    }
                    addedItems.push({
                        id: item.id,
                        content: item.content,
                        state: todo.state
                    });
                }

                return 'Todo list updated';
            }
        };
    }
}

@injectable()
export class TodoReadToolProvider implements ToolProvider {
    static ID = TODO_READ_FUNCTION_ID;

    getTool(): ToolRequest {
        return {
            id: TodoReadToolProvider.ID,
            name: TodoReadToolProvider.ID,
            description: 'Returns the current todo list for this chat session. ' +
                'Use this to see what tasks are pending or completed before making updates.',
            parameters: {
                type: 'object',
                properties: {}
            },
            handler: async (_args: string, ctx: MutableChatRequestModel): Promise<string> => {
                if (ctx?.response?.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }

                const items = ctx.session.todoList.getItems();

                return JSON.stringify({
                    items: items.map(item => ({
                        id: item.id,
                        content: item.content,
                        state: item.state,
                        notes: item.notes
                    })),
                    summary: {
                        total: items.length,
                        pending: items.filter(i => i.state === 'pending').length,
                        completed: items.filter(i => i.state === 'completed').length
                    }
                });
            }
        };
    }
}
