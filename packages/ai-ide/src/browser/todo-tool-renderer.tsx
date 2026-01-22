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

// Session-scoped registry to track TodoToolRenderer instances per session and hide previous
class TodoToolRegistry {
    private static sessionInstances: Map<string, Set<() => void>> = new Map();

    static register(sessionId: string, hideFn: () => void): void {
        let sessionSet = this.sessionInstances.get(sessionId);
        if (!sessionSet) {
            sessionSet = new Set();
            this.sessionInstances.set(sessionId, sessionSet);
        }

        sessionSet.forEach(fn => fn());
        sessionSet.clear();
        sessionSet.add(hideFn);
    }

    static unregister(sessionId: string, hideFn: () => void): void {
        const sessionSet = this.sessionInstances.get(sessionId);
        if (sessionSet) {
            sessionSet.delete(hideFn);
            if (sessionSet.size === 0) {
                this.sessionInstances.delete(sessionId);
            }
        }
    }
}

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

        const todos = this.parseTodos(response.arguments);
        return <TodoListComponent todos={todos} sessionId={parentNode.sessionId} />;
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
    sessionId: string;
}

const TodoListComponent: React.FC<TodoListComponentProps> = ({ todos, sessionId }) => {
    const [isHidden, setIsHidden] = React.useState(false);

    React.useEffect(() => {
        const hideFn = (): void => setIsHidden(true);
        TodoToolRegistry.register(sessionId, hideFn);

        return () => {
            TodoToolRegistry.unregister(sessionId, hideFn);
        };
    }, [sessionId]);

    if (isHidden) {
        // eslint-disable-next-line no-null/no-null
        return null;
    }

    if (!todos || todos.length === 0) {
        return <div className='todo-tool-empty'>{nls.localize('theia/ai-ide/todoTool/noTasks', 'No tasks')}</div>;
    }

    return (
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
