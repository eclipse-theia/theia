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

import { Disposable } from './disposable';

export function createDisposableProxy<T extends Disposable>(target: T): T {
    return new Proxy(target, new DisposableProxyHandler());
}

export class DisposableProxyHandler<T extends Disposable> implements ProxyHandler<T> {

    protected disposed = false;

    apply(target: T, thisArg: any, argArray: any[]): any {
        return Reflect.apply(target as any, thisArg, argArray);
    }

    // construct not supported on Disposable

    defineProperty(target: T, p: string | symbol, attributes: PropertyDescriptor): boolean {
        this.checkDisposed(target);
        return Reflect.defineProperty(target, p, attributes);
    }

    deleteProperty(target: T, p: string | symbol): boolean {
        this.checkDisposed(target);
        return Reflect.deleteProperty(target, p);
    }

    get(target: T, p: string | symbol, receiver: any): any {
        if (p === 'dispose') {
            return () => {
                if (!this.checkDisposed(target)) {
                    this.disposed = true;
                }
            };
        }
        this.checkDisposed(target);
        return Reflect.get(target, p, receiver);
    }

    getOwnPropertyDescriptor(target: T, p: string | symbol): PropertyDescriptor | undefined {
        this.checkDisposed(target);
        return Reflect.getOwnPropertyDescriptor(target, p);
    }

    getPrototypeOf(target: T): object | null {
        this.checkDisposed(target);
        return Reflect.getPrototypeOf(target);
    }

    has(target: T, p: string | symbol): boolean {
        this.checkDisposed(target);
        return Reflect.has(target, p);
    }

    isExtensible(target: T): boolean {
        this.checkDisposed(target);
        return Reflect.isExtensible(target);
    }

    ownKeys(target: T): ArrayLike<string | symbol> {
        this.checkDisposed(target);
        return Reflect.ownKeys(target);
    }

    preventExtensions(target: T): boolean {
        this.checkDisposed(target);
        return Reflect.preventExtensions(target);
    }

    set(target: T, p: string | symbol, value: any, receiver: any): boolean {
        this.checkDisposed(target);
        return Reflect.set(target, p, value, receiver);
    }

    setPrototypeOf(target: T, v: object): boolean {
        this.checkDisposed(target);
        return Reflect.setPrototypeOf(target, v);
    }

    protected checkDisposed(target: T): boolean {
        if (this.disposed) {
            console.trace('using a disposed instance!', target);
        }
        return this.disposed;
    }
}
