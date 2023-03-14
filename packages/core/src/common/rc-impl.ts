// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

import type { Disposable } from './disposable';
import type { Owned, Rc, ReferenceCounter } from './rc';

export class ReferenceCounterImpl implements ReferenceCounter {

    getRc<T extends Disposable>(value: T): Rc<T> {
        return new RcImpl(this.getOrCreateRcState(value));
    }

    hasRc(value: Disposable): boolean {
        return this.getRcStates().has(value);
    }

    killRcs(value: Disposable): void {
        this.getRcStates().get(value)?.dispose();
    }

    protected getRcStates(): WeakMap<Disposable, RcStateImpl> {
        const kRcStates = Symbol.for('ReferenceCounterImpl.RcStates');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (globalThis as any)[kRcStates] ??= new WeakMap();
    }

    protected getOrCreateRcState<T extends Disposable>(value: T): RcStateImpl {
        const states = this.getRcStates();
        let state = states.get(value);
        if (!state) {
            states.set(value, state = new RcStateImpl(value, () => states.delete(value)));
        }
        return state;
    }
}

/**
 * Implementation detail for `ReferenceCounterImpl` and `RcImpl`.
 */
export class RcStateImpl {

    /**
     * Should always be >= 0.
     */
    count = 0;

    /**
     * This field becomes `undefined` once the value is disposed.
     */
    #value?: Disposable;

    /**
     * This field becomes `undefined` once the value is disposed.
     */
    #onDispose?: () => void;

    constructor(value: Disposable, onDispose?: () => void) {
        this.#value = value;
        this.#onDispose = onDispose;
    }

    get value(): Disposable {
        this.#ensureValid();
        return this.#value!;
    }

    ref(): void {
        this.#ensureValid();
        this.count += 1;
    }

    unref(): void {
        this.#ensureValid();
        this.count -= 1;
        if (this.count === 0) {
            this.dispose();
        }
    }

    dispose(): void {
        this.count = 0;
        try {
            this.#value!.dispose();
        } catch (error) {
            console.error(error);
        } finally {
            this.#value = undefined;
        }
        try {
            this.#onDispose?.();
        } catch (error) {
            console.error(error);
        } finally {
            this.#onDispose = undefined;
        }
    }

    #ensureValid(): void {
        if (this.#value === undefined) {
            throw new Error('the underlying value is already disposed!');
        }
    }
}

/**
 * Handle around `RcStateImpl`.
 */
export class RcImpl<T extends Disposable> implements Rc<T> {

    #disposed = false;
    #state: RcStateImpl;

    constructor(state: RcStateImpl) {
        this.#state = state;
        this.#state.ref();
    }

    get count(): number {
        return this.#state.count;
    }

    get value(): Owned<T> {
        if (this.#disposed) {
            console.trace('accessing "value" on a disposed Rc');
        }
        return this.#state.value as T;
    }

    clone(): Rc<T> {
        if (this.#disposed) {
            console.trace('cloning from a disposed Rc');
        }
        return new RcImpl(this.#state);
    }

    dispose(): void {
        if (this.#disposed) {
            console.trace('disposing an already disposed Rc');
        } else {
            this.#disposed = true;
            this.#state.unref();
        }
    }
}
