// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { Disposable, Emitter, Event } from '@theia/core';
import { generateUuid } from '@theia/core/lib/common/uuid';

export type TodoItemState = 'pending' | 'completed';

export interface TodoItem {
    readonly id: string;
    readonly content: string;
    readonly state: TodoItemState;
    readonly notes?: string;
}

export interface SerializedTodoItem {
    id: string;
    content: string;
    state: TodoItemState;
    notes?: string;
}

export interface TodoListChangeEvent {
    kind: 'updateTodoList';
    items: TodoItem[];
}

export interface TodoList extends Disposable {
    onDidChange: Event<TodoListChangeEvent>;
    getItems(): TodoItem[];
    getItem(id: string): TodoItem | undefined;
    addItem(content: string, notes?: string): TodoItem;
    updateItem(id: string, updates: { content?: string; state?: TodoItemState; notes?: string }): boolean;
    removeItem(id: string): boolean;
    clear(): void;
    toSerializable(): SerializedTodoItem[];
    restoreFromSerialized(items: SerializedTodoItem[]): void;
}

export class TodoListImpl implements TodoList {
    protected readonly _onDidChangeEmitter = new Emitter<TodoListChangeEvent>();
    readonly onDidChange: Event<TodoListChangeEvent> = this._onDidChangeEmitter.event;

    protected _items = new Map<string, TodoItem>();

    getItems(): TodoItem[] {
        return Array.from(this._items.values());
    }

    getItem(id: string): TodoItem | undefined {
        return this._items.get(id);
    }

    addItem(content: string, notes?: string): TodoItem {
        const item: TodoItem = {
            id: generateUuid(),
            content,
            state: 'pending',
            notes
        };
        this._items.set(item.id, item);
        this.notifyChange();
        return item;
    }

    updateItem(id: string, updates: { content?: string; state?: TodoItemState; notes?: string }): boolean {
        const existing = this._items.get(id);
        if (!existing) {
            return false;
        }

        const updated: TodoItem = {
            ...existing,
            ...(updates.content !== undefined && { content: updates.content }),
            ...(updates.state !== undefined && { state: updates.state }),
            ...(updates.notes !== undefined && { notes: updates.notes })
        };

        this._items.set(id, updated);
        this.notifyChange();
        return true;
    }

    removeItem(id: string): boolean {
        const deleted = this._items.delete(id);
        if (deleted) {
            this.notifyChange();
        }
        return deleted;
    }

    clear(): void {
        if (this._items.size > 0) {
            this._items.clear();
            this.notifyChange();
        }
    }

    toSerializable(): SerializedTodoItem[] {
        return this.getItems().map(item => ({
            id: item.id,
            content: item.content,
            state: item.state,
            notes: item.notes
        }));
    }

    restoreFromSerialized(items: SerializedTodoItem[]): void {
        this._items.clear();
        for (const item of items) {
            this._items.set(item.id, {
                id: item.id,
                content: item.content,
                state: item.state,
                notes: item.notes
            });
        }
        this.notifyChange();
    }

    protected notifyChange(): void {
        this._onDidChangeEmitter.fire({ kind: 'updateTodoList', items: this.getItems() });
    }

    dispose(): void {
        this._onDidChangeEmitter.dispose();
        this._items.clear();
    }
}
