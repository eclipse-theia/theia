// *****************************************************************************
// Copyright (C) 2023 Mathieu Bussieres and others.
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

import type * as theia from '@theia/plugin';

import { TreeCollection, observableProperty } from '@theia/test/lib/common/collections';
import { TreeDeltaBuilder } from '@theia/test/lib/common/tree-delta';
import { TestControllerImpl } from './tests';

export class TestTagImpl {
    constructor(readonly id: string) { }
}

export class TestItemImpl implements theia.TestItem {
    constructor(readonly id: string, readonly uri: theia.Uri | undefined, label: string) {
        this.label = label;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected notifyPropertyChange(property: keyof TestItemImpl, value: any): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const val: any = {};
        val[property] = value;
        if (this.path) {
            this.deltaBuilder?.reportChanged(this.path, val);
        }
    }

    _deltaBuilder: TreeDeltaBuilder<string, TestItemImpl> | undefined;
    get deltaBuilder(): TreeDeltaBuilder<string, TestItemImpl> | undefined {
        if (this._deltaBuilder) {
            return this._deltaBuilder;
        } else if (this.parent) {
            this._deltaBuilder = this.parent._deltaBuilder;
            return this._deltaBuilder;
        } else {
            return undefined;
        }
    }

    _path: string[] | undefined;

    get path(): string[] {
        if (this._path) {
            return this._path;
        } else if (this.parent && this.parent.path) {
            this._path = [...this.parent.path, this.id];
            return this._path;
        } else {
            return [this.id];
        }
    };

    private _parent?: TestItemImpl | TestControllerImpl;
    get realParent(): TestItemImpl | TestControllerImpl | undefined {
        return this._parent;
    }

    set realParent(v: TestItemImpl | TestControllerImpl | undefined) {
        this.iterate(item => {
            item._path = undefined;
            return true;
        });
        this._parent = v;
    }

    get parent(): TestItemImpl | undefined {
        const p = this.realParent;
        if (p instanceof TestControllerImpl) {
            return undefined;
        }
        return p;
    }

    protected iterate(toDo: (v: TestItemImpl) => boolean): boolean {
        if (toDo(this)) {
            for (const tuple of this.children) {
                const child: TestItemImpl = tuple[1] as TestItemImpl;
                if (!child.iterate(toDo)) {
                    return false;
                }
            }
            return true;
        } else {
            return false;
        }
    }
    children: TestItemCollection = new TestItemCollection(this, (v: TestItemImpl) => v.path, (v: TestItemImpl) => v.deltaBuilder);
    @observableProperty('notifyPropertyChange')
    tags: readonly theia.TestTag[] = [];

    @observableProperty('notifyPropertyChange')
    canResolveChildren: boolean = false;
    @observableProperty('notifyPropertyChange')
    busy: boolean = false;
    @observableProperty('notifyPropertyChange')
    label: string = '';
    @observableProperty('notifyPropertyChange')
    description?: string | undefined;
    @observableProperty('notifyPropertyChange')
    sortText?: string | undefined;
    @observableProperty('notifyPropertyChange')
    range: theia.Range | undefined;
    @observableProperty('notifyPropertyChange')
    error: string | theia.MarkdownString | undefined;
}

export class TestItemCollection implements theia.TestItemCollection {

    constructor(private owner: TestItemImpl | TestControllerImpl,
        protected readonly pathOf: (v: TestItemImpl) => string[],
        protected readonly deltaBuilder: (v: TestItemImpl | TestControllerImpl | undefined) => TreeDeltaBuilder<string, TestItemImpl> | undefined) {
        this.values = new TreeCollection<string, TestItemImpl, TestItemImpl | TestControllerImpl>(owner, pathOf, deltaBuilder);
    }

    private readonly values: TreeCollection<string, TestItemImpl, TestItemImpl | TestControllerImpl>;

    get size(): number {
        return this.values.size;
    }
    replace(items: readonly theia.TestItem[]): void {
        const toRemove = this.values.values.map(item => item.id);
        items.forEach(item => this.add(item));
        toRemove.forEach(key => this.delete(key));
    }

    forEach(callback: (item: theia.TestItem, collection: theia.TestItemCollection) => unknown, thisArg?: unknown): void {
        this.values.values.forEach(item => callback(item, this), thisArg);
    }
    add(item: theia.TestItem): void {
        if (!(item instanceof TestItemImpl)) {
            throw new Error('Not an instance of TestItem');
        }
        item.realParent = this.owner;
        item._deltaBuilder = this.deltaBuilder(this.owner);
        this.values.add(item);
    }
    delete(itemId: string): void {
        this.values.remove(itemId);
    }
    get(itemId: string): theia.TestItem | undefined {
        return this.values.get(itemId);
    }

    [Symbol.iterator](): Iterator<[id: string, testItem: theia.TestItem], unknown, undefined> {
        return this.values.entries();
    }

    find(path: string[]): theia.TestItem | undefined {
        let currentCollection: theia.TestItemCollection = this;
        let item;
        for (let i = 0; i < path.length; i++) {
            item = currentCollection.get(path[i]);
            if (!item) {
                return undefined;
            }
            currentCollection = item.children;
        }
        return item;
    }
}
