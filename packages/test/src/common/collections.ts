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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function observableProperty(observationFunction: string): (target: any, property: string) => any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (target: any, property: string): any => {
        Reflect.defineProperty(target, property, {
            // @ts-ignore
            get(): unknown { return this['_' + property]; },
            set(v: unknown): void {
                // @ts-ignore
                this[observationFunction](property, v);
                // @ts-ignore
                this['_' + property] = v;
            }
        });
    };
}

export class ChangeBatcher {
    private handle: NodeJS.Timeout | undefined;
    private startTime: number | undefined;
    constructor(private emitBatch: () => void, readonly timeoutMs: number) {
    }

    changeOccurred(): void {
        if (!this.startTime) {
            this.startTime = Date.now();
            this.handle = setTimeout(() => {
                this.flush();
            }, this.timeoutMs);
        } else {
            if (Date.now() - this.startTime > this.timeoutMs) {
                this.flush();
            }
        }
    }
    flush(): void {
        if (this.handle) {
            clearTimeout(this.handle);
            this.handle = undefined;
        }
        this.startTime = undefined;
        this.emitBatch();
    }
}

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

    clear(): void {
        const copy = this._values;
        this._values = [];
        this.onChangeEmitter.fire({ removed: copy });
    }
}

abstract class AbstractIndexedCollection<K, T> {
    private keys: Map<K, T> = new Map();
    private _values: T[] | undefined;

    abstract add(item: T): T | undefined;

    get values(): readonly T[] {
        if (!this._values) {
            this._values = [...this.keys.values()];
        }
        return this._values;
    }

    get size(): number {
        return this.keys.size;
    }

    has(key: K): boolean {
        return this.keys.has(key);
    }

    get(key: K): T | undefined {
        return this.keys.get(key);
    }

    protected doAdd(key: K, value: T): T | undefined {
        const previous = this.keys.get(key);
        if (previous !== undefined) {
            return previous;
        } else {
            this.keys.set(key, value);
            this._values = undefined;
            return undefined;
        }
    }

    remove(key: K): T | undefined {
        const previous = this.keys.get(key);
        if (previous !== undefined) {
            this.keys.delete(key);
            this._values = undefined;
            return previous;
        }
        return undefined;
    }
}

export class TreeCollection<K, T, P> extends AbstractIndexedCollection<K, T> implements Iterable<[K, T]> {

    constructor(protected readonly owner: T | P,
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

    override remove(key: K): T | undefined {
        const toRemove = this.get(key);
        if (toRemove) {
            const deltaBuilder = this.deltaBuilder(toRemove);
            const path = this.pathOf(toRemove);
            super.remove(key);
            if (deltaBuilder) {
                deltaBuilder.reportRemoved(path);
            }
        }
        return toRemove;
    }

    entries(): Iterator<[K, T], unknown, undefined> {
        return this[Symbol.iterator]();
    }

    [Symbol.iterator](): Iterator<[K, T], unknown, undefined> {
        const iter = this.values.entries();
        const that = this;
        return {
            next(..._args): IteratorResult<[K, T]> {
                const res = iter.next();
                if (res.done) {
                    return { done: true, value: res.value };
                } else {
                    const path = that.pathOf(res.value[1]);
                    const result: [K, T] = [path[path.length - 1], res.value[1]];
                    return {
                        done: false,
                        value: result
                    };
                }
            }
        };

    }
}
export function groupBy<K, T>(items: Iterable<T>, keyOf: (item: T) => K): Map<K, T[]> {
    const result = new Map<K, T[]>();
    for (const item of items) {
        const key = keyOf(item);
        let values = result.get(key);
        if (!values) {
            values = [];
            result.set(key, values);
        }
        values.push(item);
    }
    return result;
}
