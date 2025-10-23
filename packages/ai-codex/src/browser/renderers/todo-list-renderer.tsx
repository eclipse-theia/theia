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
import { ChatResponseContent } from '@theia/ai-chat/lib/common';
import { codicon } from '@theia/core/lib/browser';
import { nls } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReactNode } from '@theia/core/shared/react';
import type { TodoListItem } from '@openai/codex-sdk';
import { CodexToolCallChatResponseContent } from '../codex-tool-call-content';
import { CollapsibleToolRenderer } from './collapsible-tool-renderer';

@injectable()
export class TodoListRenderer implements ChatResponsePartRenderer<CodexToolCallChatResponseContent> {

    canHandle(response: ChatResponseContent): number {
        return response.kind === 'toolCall' &&
            (response as CodexToolCallChatResponseContent).name === 'todo_list'
            ? 15
            : 0;
    }

    render(content: CodexToolCallChatResponseContent, parentNode: ResponseNode): ReactNode {
        let item: TodoListItem | undefined;

        if (content.result) {
            try {
                item = typeof content.result === 'string'
                    ? JSON.parse(content.result)
                    : content.result as TodoListItem;
            } catch (error) {
                console.error('[TodoListRenderer] Failed to parse todo_list result:', error);
            }
        }

        if (!item && content.arguments) {
            try {
                const args = JSON.parse(content.arguments);
                if (args.items) {
                    item = {
                        id: args.id || 'unknown',
                        type: 'todo_list',
                        items: args.items
                    };
                }
            } catch (error) {
                console.error('[TodoListRenderer] Failed to parse todo_list arguments:', error);
            }
        }

        if (!item) {
            return undefined;
        }

        return <TodoListComponent item={item} />;
    }
}

const TodoListComponent: React.FC<{ item: TodoListItem }> = ({ item }) => {
    const items = item.items || [];
    const completedCount = items.filter(todo => todo.completed).length;
    const totalCount = items.length;

    if (totalCount === 0) {
        // Show empty state
        return (
            <div className="codex-tool container">
                <div className="codex-tool header">
                    <div className="codex-tool header-left">
                        <span className="codex-tool title">{nls.localize('theia/ai/codex/todoList', 'Todo List')}</span>
                        <span className={`${codicon('checklist')} codex-tool icon`} />
                        <span className="codex-tool progress-text">
                            {nls.localize('theia/ai/codex/loading', 'Loading...')}
                        </span>
                    </div>
                    <div className="codex-tool header-right">
                        <span className="codex-tool badge">
                            {nls.localize('theia/ai/codex/noItems', 'No items')}
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    const compactHeader = (
        <>
            <div className="codex-tool header-left">
                <span className="codex-tool title">{nls.localize('theia/ai/codex/todoList', 'Todo List')}</span>
                <span className={`${codicon('checklist')} codex-tool icon`} />
                <span className="codex-tool progress-text">
                    {nls.localize('theia/ai/codex/completedCount', '{0}/{1} completed', completedCount, totalCount)}
                </span>
            </div>
            <div className="codex-tool header-right">
                <span className="codex-tool badge">
                    {totalCount === 1
                        ? nls.localize('theia/ai/codex/oneItem', '1 item')
                        : nls.localize('theia/ai/codex/itemCount', '{0} items', totalCount)}
                </span>
            </div>
        </>
    );

    const expandedContent = (
        <div className="codex-tool details">
            <div className="codex-tool todo-list-items">
                {items.map((todo, index) => {
                    const statusIcon = todo.completed
                        ? <span className={`${codicon('check')} codex-tool todo-status-icon completed`} />
                        : <span className={`${codicon('circle-outline')} codex-tool todo-status-icon pending`} />;

                    return (
                        <div key={index} className={`codex-tool todo-item ${todo.completed ? 'status-completed' : 'status-pending'}`}>
                            <div className="codex-tool todo-item-main">
                                <div className="codex-tool todo-item-status">{statusIcon}</div>
                                <div className="codex-tool todo-item-content">
                                    <span className="codex-tool todo-item-text">{todo.text}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
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
