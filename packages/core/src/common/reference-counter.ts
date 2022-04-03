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

import { Disposable } from './disposable';
import { Emitter, Event } from './event';
import { serviceIdentifier } from './types';

export const RcFactory = serviceIdentifier<RcFactory>('RcFactory');
export type RcFactory = <T extends Disposable>(ref: T) => Rc<T>;

/**
 * This is a disposable reference counter to some underlying disposable instance.
 *
 * Call `.clone()` to create a new reference (increasing the reference count).
 *
 * The underlying resource will be disposed once all references are disposed.
 */
export interface Rc<T extends Disposable> extends Disposable {
    ref(): Omit<T, 'dispose'>;
    /**
     * Create a new `Rc<T>` instance referencing the same `T` instance,
     * incrementing the reference count by 1.
     * @throws if `T` was disposed.
     */
    clone(): Rc<T>
    /**
     * Decrement the reference count by 1.
     *
     * Note that calling `dispose` more than once does nothing.
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
    /**
     * Event emitted once all `Rc<T>` are disposed and we are about to dispose
     * the underlying `T` instance.
     */
    onWillDisposeRef: Event<Omit<T, 'dispose'>>
};

/**
 * @internal
 */
export interface DefaultRcState<T extends Disposable> {
    onWillDisposeReferenceEmitter: Emitter<T>
    count: number
    ref?: T
}
/**
 * @internal
 */
export class DefaultRc<T extends Disposable> implements Rc<T> {

    static New<T extends Disposable>(ref: T): Rc<T> {
        return new this({
            ref,
            count: 0,
            onWillDisposeReferenceEmitter: new Emitter<T>()
        });
    }

    protected _disposed = false;

    protected constructor(
        protected _state: DefaultRcState<T>
    ) {
        this._state.count += 1;
    }

    get onWillDisposeRef(): Event<T> {
        if (this.isRefDisposed()) {
            return Event.None;
        }
        return this._state.onWillDisposeReferenceEmitter.event;
    }

    ref(): T {
        this.checkDisposed();
        return this._state.ref!;
    }

    clone(): Rc<T> {
        this.checkDisposed();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new (this.constructor as any)(this._state!);
    }

    dispose(): void {
        if (this.isDisposed()) {
            console.trace('reference counter is already disposed!');
            return;
        }
        this._state.count -= 1;
        if (this._state.count === 0) {
            this._state.onWillDisposeReferenceEmitter.fire(this._state.ref!);
            this._state.onWillDisposeReferenceEmitter.dispose();
            this._state.ref!.dispose();
            this._state.ref = undefined;
        }
    }

    isDisposed(): this is never {
        return this._disposed;
    }

    isRefDisposed(): this is never {
        return this._state.ref === undefined;
    }

    protected checkDisposed(): void {
        if (this.isDisposed()) {
            throw new Error('reference is disposed!');
        }
    }
}
