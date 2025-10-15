// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { ChatResponsePartRenderer } from '@theia/ai-chat-ui/lib/browser/chat-response-part-renderer';
import { ResponseNode } from '@theia/ai-chat-ui/lib/browser/chat-tree-view';
import { ChatResponseContent, ToolCallChatResponseContent } from '@theia/ai-chat/lib/common';
import { codicon } from '@theia/core/lib/browser';
import { injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReactNode } from '@theia/core/shared/react';
import { ClaudeCodeToolCallChatResponseContent } from '../claude-code-tool-call-content';
import { CollapsibleToolRenderer } from './collapsible-tool-renderer';

interface TodoItem {
    id: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    priority: 'high' | 'medium' | 'low';
}

interface TodoWriteInput {
    todos: TodoItem[];
}

// Session-scoped registry to track TodoWrite renderer instances per session
class TodoWriteRegistry {
    private static sessionInstances: Map<string, Set<() => void>> = new Map();

    static register(sessionId: string, hideFn: () => void): void {
        // Get or create instances set for this session
        let sessionSet = this.sessionInstances.get(sessionId);
        if (!sessionSet) {
            sessionSet = new Set();
            this.sessionInstances.set(sessionId, sessionSet);
        }

        // Hide all previous instances in this session
        sessionSet.forEach(fn => fn());
        // Clear the session registry
        sessionSet.clear();
        // Add the new instance
        sessionSet.add(hideFn);
    }

    static unregister(sessionId: string, hideFn: () => void): void {
        const sessionSet = this.sessionInstances.get(sessionId);
        if (sessionSet) {
            sessionSet.delete(hideFn);
            // Clean up empty session entries
            if (sessionSet.size === 0) {
                this.sessionInstances.delete(sessionId);
            }
        }
    }
}

@injectable()
export class TodoWriteRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {

    canHandle(response: ChatResponseContent): number {
        if (ClaudeCodeToolCallChatResponseContent.is(response) && response.name === 'TodoWrite') {
            return 15; // Higher than default ToolCallPartRenderer (10)
        }
        return -1;
    }

    render(response: ToolCallChatResponseContent, parentNode: ResponseNode): ReactNode {
        try {
            const input = JSON.parse(response.arguments || '{}') as TodoWriteInput;
            return <TodoListComponent todos={input.todos || []} sessionId={parentNode.sessionId} />;
        } catch (error) {
            console.warn('Failed to parse TodoWrite input:', error);
            return <div className="claude-code-tool todo-list-error">Failed to parse todo list data</div>;
        }
    }
}

const TodoListComponent: React.FC<{ todos: TodoItem[]; sessionId: string }> = ({ todos, sessionId }) => {
    const [isHidden, setIsHidden] = React.useState(false);

    React.useEffect(() => {
        const hideFn = () => setIsHidden(true);
        TodoWriteRegistry.register(sessionId, hideFn);

        return () => {
            TodoWriteRegistry.unregister(sessionId, hideFn);
        };
    }, [sessionId]);

    if (isHidden) {
        // eslint-disable-next-line no-null/no-null
        return null;
    }
    const getStatusIcon = (status: TodoItem['status']) => {
        switch (status) {
            case 'completed':
                return <span className={`${codicon('check')} claude-code-tool todo-status-icon completed`} />;
            case 'in_progress':
                return <span className={`${codicon('loading')} claude-code-tool todo-status-icon in-progress theia-animation-spin`} />;
            case 'pending':
            default:
                return <span className={`${codicon('circle-outline')} claude-code-tool todo-status-icon pending`} />;
        }
    };

    const getPriorityBadge = (priority: TodoItem['priority']) => (
        <span className={`claude-code-tool todo-priority priority-${priority}`}>{priority}</span>
    );

    if (!todos || todos.length === 0) {
        return (
            <div className="claude-code-tool todo-list-container">
                <div className="claude-code-tool todo-list-header">
                    <span className={`${codicon('checklist')} claude-code-tool todo-list-icon`} />
                    <span className="claude-code-tool todo-list-title">Todo List</span>
                </div>
                <div className="claude-code-tool todo-list-empty">No todos available</div>
            </div>
        );
    }

    const completedCount = todos.filter(todo => todo.status === 'completed').length;
    const totalCount = todos.length;

    const compactHeader = (
        <>
            <div className="claude-code-tool header-left">
                <span className="claude-code-tool title">Todo List</span>
                <span className={`${codicon('checklist')} claude-code-tool icon`} />
                <span className="claude-code-tool progress-text">{completedCount}/{totalCount} completed</span>
            </div>
            <div className="claude-code-tool header-right">
                <span className="claude-code-tool badge">{totalCount} item{totalCount !== 1 ? 's' : ''}</span>
            </div>
        </>
    );

    const expandedContent = (
        <div className="claude-code-tool details">
            <div className="claude-code-tool todo-list-items">
                {todos.map(todo => (
                    <div key={todo.id || todo.content} className={`claude-code-tool todo-item status-${todo.status}`}>
                        <div className="claude-code-tool todo-item-main">
                            <div className="claude-code-tool todo-item-status">
                                {getStatusIcon(todo.status)}
                            </div>
                            <div className="claude-code-tool todo-item-content">
                                <span className="claude-code-tool todo-item-text">{todo.content}</span>
                                {getPriorityBadge(todo.priority)}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <CollapsibleToolRenderer
            compactHeader={compactHeader}
            expandedContent={expandedContent}
            defaultExpanded={true}
        />
    );
};
