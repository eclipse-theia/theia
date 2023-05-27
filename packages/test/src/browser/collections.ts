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

import { Event } from '@theia/core';
import { CollectionDelta, TreeDeltaBuilder } from './tree-delta';
import { Emitter } from '@theia/core/shared/vscode-languageserver-protocol';

export class SimpleObservableCollection<V> {
    private _values: V[] = [];

    constructor(private equals: (left: V, right: V) => boolean = (left, right) => left === right) {
    }

    add(value: V): boolean {
        if (!this._values.find(v => this.equals(v, value))) {
            this._values.push(value);
            this.onChangeEmitter.fire({ added: [value] });
            return true;
        }
        return false;
    }

    remove(value: V): boolean {
        const index = this._values.findIndex(v => this.equals(v, value));
        if (index >= 0) {
            this._values.splice(index, 1);
            this.onChangeEmitter.fire({ removed: [value] });
            return true;
        }
        return false;
    }

    private onChangeEmitter = new Emitter<CollectionDelta<V, V>>();
    onChanged: Event<CollectionDelta<V, V>> = this.onChangeEmitter.event;
    get values(): readonly V[] {
        return this._values;
    }
}

abstract class AbstractIndexedCollection<K, T> {
    private keys: Map<K, number> = new Map();
    private _values: T[] = [];

    abstract add(item: T): T | undefined;

    get values(): readonly T[] {
        return this._values;
    }

    has(key: K): boolean {
        return this.keys.has(key);
    }

    get(key: K): T | undefined {
        const index = this.keys.get(key);
        if (index && index >= 0) {
            return this._values[index];
        } else {
            return undefined;
        }
    }

    protected doAdd(key: K, value: T): T | undefined {
        const index = this.keys.get(key);
        if (index) {
            const previous = this._values[index];
            this._values[index] = value;
            return previous;
        } else {
            this._values.push(value);
            this.keys.set(key, this._values.length - 1);
            return undefined;
        }
    }

    abstract remove(value: T): T | undefined;

    doRemove(key: K, value: T): T | undefined {
        const index = this.keys.get(key);
        if (index) {
            const previous = this._values[index];
            this._values.slice(index, 1);
            return previous;
        }
        return undefined;
    }
}

export class TreeCollection<K, T> extends AbstractIndexedCollection<K, T> {

    constructor(protected readonly owner: T | undefined,
        protected readonly pathOf: (v: T) => K[],
        protected readonly deltaBuilder: (v: T | undefined) => TreeDeltaBuilder<K, T> | undefined) {
        super();
    }

    add(item: T): T | undefined {
        const path = this.pathOf(item);
        const previous = this.doAdd(path[path.length - 1], item);
        const deltaBuilder = this.deltaBuilder(item);
        if (deltaBuilder) {
            if (previous) {
                deltaBuilder.reportChanged(path, item);
            } else {
                deltaBuilder.reportAdded(path, item);
            }
        }
        return previous;
    }

    override remove(value: T): T | undefined {
        const path = this.pathOf(value);
        const previous = super.doRemove(path[path.length - 1], value);
        const deltaBuilder = this.deltaBuilder(value);
        if (deltaBuilder && previous) {
            deltaBuilder.reportRemoved(path);
        }
        return previous;
    }
}
