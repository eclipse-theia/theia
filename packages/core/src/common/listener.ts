// *****************************************************************************
// Copyright (C) 2025 ST Microelectronics and others.
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

import { Disposable } from './disposable';

/**
 * Ths code in this file implements a list of listeners that can be invoked sequentially with a callback to handle
 * the results of the listener invocation.
 */

type Listener<T, U> = (e: T) => U;
interface ListenerRegistration<T, U> {
    id: number,
    listener: Listener<T, U>;
}

export namespace Listener {
    export type Registration<T, U = void> = (listener: (e: T) => U) => Disposable;
    export const None: Registration<void, void> = () => Disposable.NULL;

    /**
     * Convenience function to await all listener invocations
     * @param value The value to invoke the listeners with
     * @param list the listener list to invoke
     * @returns the return values from the listener invocation
     */
    export async function await<T, U>(value: T, list: ListenerList<T, Promise<U>>): Promise<U[]> {
        const promises: Promise<U>[] = [];
        list.invoke(value, promise => {
            promises.push(promise);
        });
        return await Promise.all(promises);
    }
}

export class ListenerList<T, U> {
    private listeners: ListenerRegistration<T, U> | (ListenerRegistration<T, U>)[] | undefined;
    private registeredCount = 1; // start at 1 to prevent falsy madness

    registration: Listener.Registration<T, U> = this.register.bind(this);

    private register(listener: Listener<T, U>): Disposable {
        const reg: ListenerRegistration<T, U> = { id: this.registeredCount++, listener };
        if (!this.listeners) {
            this.listeners = reg;
        } else if (Array.isArray(this.listeners)) {
            this.listeners.push(reg as ListenerRegistration<T, U>);
        } else {
            this.listeners = [this.listeners, reg];
        }
        return Disposable.create(() => {
            this.remove(reg.id);
        });
    }
    private remove(id: number): void {
        if (Array.isArray(this.listeners)) {
            const index = this.listeners.findIndex(v => v.id === id);
            if (index >= 0) {
                this.listeners.splice(index, 1);
            }
        } else if (this.listeners && this.listeners.id === id) {
            this.listeners = undefined;
        }
    }

    invoke(e: T, callback: (value: U) => void): void {
        if (Array.isArray(this.listeners)) {
            for (const l of this.listeners) {
                callback(l.listener(e));
            }
        } else if (this.listeners) {
            callback(this.listeners.listener(e));
        }
    }
}
