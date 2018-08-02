/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { Disposable, DisposableCollection } from './disposable';
import { Emitter, Event } from './event';
import { MaybePromise } from './types';

export interface Reference<T> extends Disposable {
    readonly object: T
}

export class ReferenceCollection<K, V extends Disposable> implements Disposable {

    protected readonly _keys = new Map<string, K>();
    protected readonly _values = new Map<string, V>();
    protected readonly references = new Map<string, DisposableCollection>();

    protected readonly onDidCreateEmitter = new Emitter<V>();
    readonly onDidCreate: Event<V> = this.onDidCreateEmitter.event;

    protected readonly onWillDisposeEmitter = new Emitter<V>();
    readonly onWillDispose: Event<V> = this.onWillDisposeEmitter.event;

    protected readonly toDispose = new DisposableCollection();

    constructor(protected readonly factory: (key: K) => MaybePromise<V>) {
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

    async acquire(args: K): Promise<Reference<V>> {
        const key = this.toKey(args);
        const object = await this.getOrCreateValue(key, args);
        const references = this.references.get(key) || this.createReferences(key, object);
        const reference: Reference<V> = {
            object,
            dispose: () => { }
        };
        references.push(reference);
        return reference;
    }

    protected readonly pendingValues = new Map<string, MaybePromise<V>>();
    protected async getOrCreateValue(key: string, args: K): Promise<V> {
        const existing = this._values.get(key) || this.pendingValues.get(key);
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
