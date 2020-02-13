/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

/**
 * Simple implementation of the deferred pattern.
 * An object that exposes a promise and functions to resolve and reject it.
 */
export class Deferred<T> {
    resolve: (value?: T) => void;
    reject: (err?: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

    promise = new Promise<T>((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
    });
}

/**
 * DeferredSync exposes an async value in a synchronous way.
 */
export class DeferredSync<T> {

    resolved: boolean;
    value?: T;
    error?: any; // eslint-disable-line @typescript-eslint/no-explicit-any

    resolve: (value?: T) => void;
    reject: (error?: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

    promise = new Promise<T>((resolve, reject) => {
        this.resolve = (value: T) => {
            if (!this.resolved) {
                this.resolved = true;
                resolve(this.value = value);
            }
        };
        this.reject = (error: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            if (!this.resolved) {
                this.resolved = true;
                reject(this.error = error);
            }
        };
    });
}
