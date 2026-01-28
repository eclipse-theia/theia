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
import { ChatResponsePartRenderer } from '@theia/ai-chat-ui/lib/browser/chat-response-part-renderer';
import { ResponseNode } from '@theia/ai-chat-ui/lib/browser/chat-tree-view';
import { ChatResponseContent, ToolCallChatResponseContent } from '@theia/ai-chat/lib/common';
import { ReactNode } from '@theia/core/shared/react';
import * as React from '@theia/core/shared/react';
import { codicon } from '@theia/core/lib/browser';
import { nls } from '@theia/core';
import { TODO_WRITE_FUNCTION_ID, TodoItem, isValidTodoItem } from './todo-tool';

@injectable()
export class TodoToolRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {

    canHandle(response: ChatResponseContent): number {
        if (ToolCallChatResponseContent.is(response) && response.name === TODO_WRITE_FUNCTION_ID) {
            return 20;
        }
        return -1;
    }

    render(response: ToolCallChatResponseContent, parentNode: ResponseNode): ReactNode {
        // Don't render anything until arguments are available
        if (!response.arguments) {
            return undefined;
        }

        // Only render the latest todo_write call in this response
        if (!this.isLatestTodoWriteInResponse(response, parentNode)) {
            // eslint-disable-next-line no-null/no-null
            return null;
        }

        const todos = this.parseTodos(response.arguments);
        return <TodoListComponent todos={todos} />;
    }

    protected isLatestTodoWriteInResponse(response: ToolCallChatResponseContent, parentNode: ResponseNode): boolean {
        // Find all todo_write tool call IDs within this response
        const todoWriteIds = parentNode.response.response.content
            .filter(c => ToolCallChatResponseContent.is(c) && c.name === TODO_WRITE_FUNCTION_ID)
            .map(c => (c as ToolCallChatResponseContent).id);

        // This is the latest if it's the last one in the response
        return todoWriteIds[todoWriteIds.length - 1] === response.id;
    }

    private parseTodos(args: string | undefined): TodoItem[] | undefined {
        if (!args) {
            return undefined;
        }
        try {
            const parsed = JSON.parse(args);
            if (!Array.isArray(parsed.todos)) {
                return undefined;
            }
            return parsed.todos.filter(isValidTodoItem);
        } catch {
            return undefined;
        }
    }
}

interface TodoListComponentProps {
    todos: TodoItem[] | undefined;
}

const TodoListComponent: React.FC<TodoListComponentProps> = ({ todos }) => {
    const header = (
        <div className='todo-tool-header'>
            <i className={codicon('checklist')} />
            <span className='todo-tool-title'>{nls.localizeByDefault('Todos')}</span>
        </div>
    );

    if (!todos || todos.length === 0) {
        return (
            <div className='todo-tool-container'>
                {header}
                <div className='todo-tool-empty'>{nls.localize('theia/ai-ide/todoTool/noTasks', 'No tasks')}</div>
            </div>
        );
    }

    return (
        <div className='todo-tool-container'>
            {header}
            <div className='todo-tool-list'>
                {todos.map((todo, index) => (
                    <div key={index} className={`todo-tool-item todo-status-${todo.status}`}>
                        <span className='todo-tool-icon'>{getStatusIcon(todo.status)}</span>
                        <span className='todo-tool-text'>
                            {todo.status === 'in_progress' ? todo.activeForm : todo.content}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

function getStatusIcon(status: string): ReactNode {
    switch (status) {
        case 'pending':
            return <i className={codicon('circle-large-outline')} />;
        case 'in_progress':
            return <i className={`${codicon('sync')} theia-animation-spin`} />;
        case 'completed':
            return <i className={codicon('pass-filled')} />;
        default:
            return undefined;
    }
}
