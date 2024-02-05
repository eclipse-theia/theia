// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { Disposable, DisposableCollection } from './disposable';
import { Emitter, Event } from './event';
import { MaybePromise } from './types';

export interface Reference<T> extends Disposable {
    readonly object: T
}

/**
 * Abstract class for a map of reference-counted disposable objects, with the
 * following features:
 *
 *    - values are not inserted explicitly; instead, acquire() is used to
 *      create the value for a given key, or return the previously created
 *      value for it. How the value is created for a given key is
 *      implementation specific.
 *
 *    - any subsquent acquire() with the same key will bump the reference
 *      count on that value. acquire() returns not the value directly but
 *      a reference object that holds the value. Calling dispose() on the
 *      reference decreases the value's effective reference count.
 *
 *    - a contained value will have its dispose() function called when its
 *      reference count reaches zero. The key/value pair will be purged
 *      from the collection.
 *
 *    - calling dispose() on the value directly, instead of calling it on
 *      the reference returned by acquire(), will automatically dispose
 *      all outstanding references to that value and the key/value pair
 *      will be purged from the collection.
 *
 *    - supports synchronous and asynchronous implementations. acquire() will
 *      return a Promise if the value cannot be created immediately
 *
 *    - functions has|keys|values|get are always synchronous and the result
 *      excludes asynchronous additions in flight.
 *
 *    - functions values|get return the value directly and not a reference
 *      to the value. Use these functions to obtain a value without bumping
 *      its reference count.
 *
 *    - clients can register to be notified when values are added and removed;
 *      notification for asynchronous additions happen when the creation
 *      completes, not when it's requested.
 *
 *    - keys can be any value/object that can be successfully stringified using
 *      JSON.stringify(), sans arguments
 *
 *    - calling dispose() on the collection will dispose all outstanding
 *      references to all contained values, which results in the disposal of
 *      the values themselves.
 */
export abstract class AbstractReferenceCollection<K, V extends Disposable> implements Disposable {

    protected readonly _keys = new Map<string, K>();
    protected readonly _values = new Map<string, V>();
    protected readonly references = new Map<string, DisposableCollection>();

    protected readonly onDidCreateEmitter = new Emitter<V>();
    readonly onDidCreate: Event<V> = this.onDidCreateEmitter.event;

    protected readonly onWillDisposeEmitter = new Emitter<V>();
    readonly onWillDispose: Event<V> = this.onWillDisposeEmitter.event;

    protected readonly toDispose = new DisposableCollection();

    constructor() {
        this.toDispose.push(this.onDidCreateEmitter);
        this.toDispose.push(this.onWillDisposeEmitter);
        this.toDispose.push(Disposable.create(() => this.clear()));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    clear(): void {
        for (const value of this._values.values()) {
            try {
                value.dispose();
            } catch (e) {
                console.error(e);
            }
        }
    }

    has(args: K): boolean {
        const key = this.toKey(args);
        return this.references.has(key);
    }

    keys(): K[] {
        return [...this._keys.values()];
    }

    values(): V[] {
        return [...this._values.values()];
    }

    get(args: K): V | undefined {
        const key = this.toKey(args);
        return this._values.get(key);
    }

    abstract acquire(args: K): MaybePromise<Reference<V>>;

    protected doAcquire(key: string, object: V): Reference<V> {
        const references = this.references.get(key) || this.createReferences(key, object);
        const reference: Reference<V> = {
            object,
            dispose: () => { }
        };
        references.push(reference);
        return reference;
    }

    protected toKey(args: K): string {
        return JSON.stringify(args);
    }

    protected createReferences(key: string, value: V): DisposableCollection {
        const references = new DisposableCollection();
        references.onDispose(() => value.dispose());
        const disposeObject = value.dispose.bind(value);
        value.dispose = () => {
            this.onWillDisposeEmitter.fire(value);
            disposeObject();
            this._values.delete(key);
            this._keys.delete(key);
            this.references.delete(key);
            references!.dispose();
        };
        this.references.set(key, references);
        return references;
    }

}

/**
 * Asynchronous implementation of AbstractReferenceCollection that requires
 * the client to provide a value factory, used to service the acquire()
 * function. That factory may return a Promise if the value cannot be
 * created immediately.
 */
export class ReferenceCollection<K, V extends Disposable> extends AbstractReferenceCollection<K, V> {

    constructor(protected readonly factory: (key: K) => MaybePromise<V>) {
        super();
    }

    async acquire(args: K): Promise<Reference<V>> {
        const key = this.toKey(args);
        const existing = this._values.get(key);
        if (existing) {
            return this.doAcquire(key, existing);
        }
        const object = await this.getOrCreateValue(key, args);
        return this.doAcquire(key, object);
    }

    protected readonly pendingValues = new Map<string, MaybePromise<V>>();
    protected async getOrCreateValue(key: string, args: K): Promise<V> {
        const existing = this.pendingValues.get(key);
        if (existing) {
            return existing;
        }
        const pending = this.factory(args);
        this._keys.set(key, args);
        this.pendingValues.set(key, pending);
        try {
            const value = await pending;
            this._values.set(key, value);
            this.onDidCreateEmitter.fire(value);
            return value;
        } catch (e) {
            this._keys.delete(key);
            throw e;
        } finally {
            this.pendingValues.delete(key);
        }
    }

}

/**
 * Synchronous implementation of AbstractReferenceCollection that requires
 * the client to provide a value factory, used to service the acquire()
 * function.
 */
export class SyncReferenceCollection<K, V extends Disposable> extends AbstractReferenceCollection<K, V> {

    constructor(protected readonly factory: (key: K) => V) {
        super();
    }

    acquire(args: K): Reference<V> {
        const key = this.toKey(args);
        const object = this.getOrCreateValue(key, args);
        return this.doAcquire(key, object);
    }

    protected getOrCreateValue(key: string, args: K): V {
        const existing = this._values.get(key);
        if (existing) {
            return existing;
        }
        const value = this.factory(args);
        this._keys.set(key, args);
        this._values.set(key, value);
        this.onDidCreateEmitter.fire(value);
        return value;
    }

}
