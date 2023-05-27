/* eslint-disable @typescript-eslint/no-explicit-any */
// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics and others.
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

import { Event, URI } from '@theia/core';
import { Range } from '@theia/core/shared/vscode-languageserver-protocol';

import { TestController, TestItem, TestRun, TestRunProfile } from './test-service';
import { TreeDelta, CollectionDelta, TreeDeltaBuilder, AccumulatingTreeDeltaEmitter } from './tree-delta';
import { SimpleObservableCollection, TreeCollection } from './collections';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function observableProperty(observationFunction: string): (target: any, property: string) => any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (target: any, property: string): any => {
        Reflect.defineProperty(target, property, {
            // @ts-ignore
            get(): any { return this['_' + property]; },
            set(v: any): void {
                // @ts-ignore
                this[observationFunction](property, v);
                // @ts-ignore
                this['_' + property] = v;
            }
        });
    };
}

class TestItemCollection extends TreeCollection<string, TestItemImpl> {
    override add(item: TestItemImpl): TestItemImpl | undefined {
        item.parent = this.owner;
        item._deltaBuilder = this.deltaBuilder(this.owner);
        return super.add(item);
    }
}

export class TestItemImpl implements TestItem {
    constructor(readonly uri: URI, readonly id: string) {
        this._children = new TestItemCollection(this, (v: TestItemImpl) => v.path, (v: TestItemImpl) => v.deltaBuilder);
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected notifyPropertyChange(property: keyof TestItemImpl, value: any): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const val: any = {};
        val[property] = value;
        if (this.path) {
            this.deltaBuilder?.reportChanged(this.path, val);
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

    private _parent?: TestItemImpl;
    get parent(): TestItemImpl | undefined {
        return this._parent;
    }

    set parent(v: TestItemImpl | undefined) {
        this.iterate(item => {
            item._path = undefined;
            return true;
        });
        this._parent = v;
    }

    protected iterate(toDo: (v: TestItemImpl) => boolean): boolean {
        if (toDo(this)) {
            for (let i = 0; i < this._children.values.length; i++) {
                if (!this._children.values[i].iterate(toDo)) {
                    return false;
                }
            }
            return true;
        } else {
            return false;
        }
    }

    @observableProperty('notifyPropertyChange')
    label: string;

    @observableProperty('notifyPropertyChange')
    range: Range;

    @observableProperty('notifyPropertyChange')
    sortKey?: string | undefined;

    @observableProperty('notifyPropertyChange')
    tags: string[];

    @observableProperty('notifyPropertyChange')
    busy: boolean;

    @observableProperty('notifyPropertyChange')
    canResolveChildren: boolean;

    @observableProperty('notifyPropertyChange')
    description?: string | undefined;

    @observableProperty('notifyPropertyChange')
    error?: string | MarkdownString | undefined;

    _children: TestItemCollection;
    get children(): readonly TestItem[] {
        return this._children.values;
    }
}

export class TestControllerImpl implements TestController {
    private _profiles = new SimpleObservableCollection<TestRunProfile>();
    private _runs = new SimpleObservableCollection<TestRun>();
    private deltaBuilder = new AccumulatingTreeDeltaEmitter<string, TestItemImpl>(300);
    items = new TestItemCollection(undefined, item => item.path, () => this.deltaBuilder);

    constructor(readonly id: string, readonly label: string) {
    }

    get testRunProfiles(): readonly TestRunProfile[] {
        return this._profiles.values;
    }

    addProfile(profile: TestRunProfile): void {
        this._profiles.add(profile);
    }

    onProfilesChanged: Event<CollectionDelta<TestRunProfile, TestRunProfile>> = this._profiles.onChanged;

    get testRuns(): readonly TestRun[] {
        return this._runs.values;
    }
    onRunsChanged: Event<CollectionDelta<TestRun, TestRun>> = this._runs.onChanged;

    get tests(): readonly TestItem[] {
        return this.items.values;
    }
    onItemsChanged: Event<TreeDelta<string, TestItem>[]> = this.deltaBuilder.emitter.event;
}
