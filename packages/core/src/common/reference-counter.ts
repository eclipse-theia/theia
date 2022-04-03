// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Disposable, Owned } from './disposable';
import { Emitter, Event } from './event';
import { serviceIdentifier } from './types';

interface IMap<K, V> {
    delete(key: K): boolean
    get(key: K): V | undefined
    has(key: K): boolean
    set(key: K, value: V): void
}

/**
 * This is a disposable reference counter to some underlying disposable instance.
 *
 * Call `.clone()` to create a new reference (increasing the reference count).
 *
 * The underlying resource will be disposed once all references are disposed.
 */
export interface Rc<T extends Disposable> extends Disposable {

    /**
     * Event emitted once all `Rc<T>` are disposed and we are about to dispose
     * the underlying `T` instance.
     */
    onDidDisposeRef: Event<void>

    /**
     * Get a reference to the wrapped `T`.
     * @note You should not call dispose on the returned value.
     * @throws If `T` was disposed.
     */
    ref(): Owned<T>;

    /**
     * Create a new `Rc<T>` instance referencing the same `T` instance,
     * incrementing the reference count by 1.
     * @throws If `T` was disposed.
     */
    clone(): Rc<T>

    /**
     * Decrement the reference count by 1.
     * @note Calling `dispose` more than once does nothing.
     */
    dispose(): void

    /**
     * Is this specific `Rc<T>` instance disposed.
     */
    isDisposed(): boolean

    /**
     * Is `T` disposed. If `true` it means all `Rc<T>` were also disposed.
     */
    isRefDisposed(): this is never
}
export namespace Rc {

    export enum Errors {
        RC_DISPOSED = 'this reference is disposed',
        REF_DISPOSED = 'the underlying reference is disposed'
    }

    /**
     * @internal
     *
     * Global map of {@link Disposable} to its current wrapping {@link Rc} instance.
     */
    export const GlobalMap: IMap<Disposable, Rc<any>> = new WeakMap();

    export const Tracker = serviceIdentifier<Tracker>('Rc.Tracker');
    export interface Tracker {
        track<T extends Disposable>(disposable: T): Rc<T>;
        isTracked(disposable: Disposable): boolean;
    }

    /**
     * Called when the reference count goes from 1 to 0.
     * @param dispose Dispose the underlying instance.
     */
    export type DisposeCallback = (dispose: () => void) => ReviveCallback | void;

    /**
     * Called when the reference count goes from 0 to 1.
     */
    export type ReviveCallback = () => void;

    /**
     * Map-like structure that returns {@link Rc} clones on each access.
     */
    export class SharedRefMap<K, T extends Disposable> {

        constructor(
            protected initialRcFactory: (key: K) => Rc<T>,
            protected rcMap: IMap<K, Rc<T>> = new Map()
        ) { }

        cloneOrCreate(key: K): Rc<T> {
            let rc = this.rcMap.get(key);
            if (rc) {
                return rc.clone();
            } else {
                this.rcMap.set(key, rc = this.initialRcFactory(key));
                rc.onDidDisposeRef(() => this.rcMap.delete(key));
                return rc;
            }
        }
    }
}

/**
 * @internal
 */
export interface DefaultRcState<T extends Disposable> {
    disposeCallback?: Rc.DisposeCallback
    reviveCallback?: Rc.ReviveCallback
    onDidDisposeRefEmitter: Emitter<void>
    count: number
    ref?: T
}

/**
 * @internal
 */
export class DefaultRc<T extends Disposable> implements Rc<T> {

    static New<T extends Disposable>(ref: T, disposeCallback?: Rc.DisposeCallback): Rc<T> {
        return new this({
            ref,
            count: 0,
            onDidDisposeRefEmitter: new Emitter(),
            disposeCallback
        });
    }

    protected disposed = false;

    protected constructor(
        protected state: DefaultRcState<T>
    ) {
        this.state.count += 1;
        if (this.state.count === 1 && this.state.reviveCallback) {
            this.state.reviveCallback();
            this.state.reviveCallback = undefined;
        }
    }

    get onDidDisposeRef(): Event<void> {
        if (this.isRefDisposed()) {
            return Event.None;
        }
        return this.state.onDidDisposeRefEmitter.event;
    }

    ref(): T {
        if (this.isRefDisposed()) {
            throw new Error(Rc.Errors.REF_DISPOSED);
        }
        if (this.isDisposed()) {
            console.trace(Rc.Errors.RC_DISPOSED);
        }
        return this.state.ref!;
    }

    clone(): Rc<T> {
        if (this.isRefDisposed()) {
            throw new Error(Rc.Errors.REF_DISPOSED);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new (this.constructor as any)(this.state!);
    }

    dispose(): void {
        if (this.isDisposed()) {
            console.trace(Rc.Errors.RC_DISPOSED);
            return;
        }
        this.disposed = true;
        this.state.count -= 1;
        if (this.state.count === 0) {
            if (this.state.disposeCallback) {
                const result = this.state.disposeCallback(() => {
                    if (this.state.count === 0) {
                        this.disposeRef();
                    }
                });
                if (typeof result === 'function') {
                    this.state.reviveCallback = result;
                }
            } else {
                this.disposeRef();
            }
        }
    }

    isDisposed(): boolean {
        return this.disposed;
    }

    isRefDisposed(): this is never {
        return this.state.ref === undefined;
    }

    protected disposeRef(): void {
        try {
            this.state.ref!.dispose();
        } finally {
            this.state.ref = undefined;
            this.state.onDidDisposeRefEmitter.fire();
            this.state.onDidDisposeRefEmitter.dispose();
        }
    }
}

export class DefaultTracker implements Rc.Tracker {

    protected refs: Rc.SharedRefMap<Disposable, any>;

    constructor(
        protected rcFactory: <T extends Disposable>(disposable: T) => Rc<T>,
        protected rcMap: IMap<Disposable, Rc<any>>
    ) {
        this.refs = new Rc.SharedRefMap(rcFactory, rcMap);
    }

    track<T extends Disposable>(disposable: T): Rc<T> {
        return this.refs.cloneOrCreate(disposable);
    }

    isTracked(disposable: Disposable): boolean {
        return this.rcMap.has(disposable);
    }
}
