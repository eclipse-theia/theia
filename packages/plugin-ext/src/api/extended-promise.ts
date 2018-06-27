/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

export class ExtendedPromise<T> implements Promise<T> {
    private delegate: Promise<T>;
    private resolveDelegate: (value?: T) => void;
    private rejectDelegate: (reason?: T) => void;
    constructor() {
        this.delegate = new Promise((resolve, reject) => {
            this.resolveDelegate = resolve;
            this.rejectDelegate = reject;
        });
    }

    resolve(value: T): void {
        this.resolveDelegate(value);
    }

    reject(err: any): void {
        this.rejectDelegate(err);
    }

    then<TResult1 = T, TResult2 = never>(onfulfilled?: (value: T) => TResult1 | PromiseLike<TResult1>,
        onrejected?: (reason: T) => TResult2 | PromiseLike<TResult2>): Promise<TResult1 | TResult2> {
        return this.delegate.then(onfulfilled, onrejected);
    }
    catch<TResult = never>(onrejected?: (reason: any) => TResult | PromiseLike<TResult>): Promise<any> {
        return this.delegate.catch(onrejected);
    }
    [Symbol.toStringTag]: "Promise";

    public static any<T>(promises: PromiseLike<T>[]): ExtendedPromise<{ key: number; value: PromiseLike<T>; }> {
        const result = new ExtendedPromise<{ key: number; value: PromiseLike<T>; }>();
        if (promises.length === 0) {
            result.resolveDelegate();
        }

        promises.forEach((val, key) => {
            Promise.resolve(promises[key]).then(() => {
                result.resolveDelegate({ key: key, value: promises[key] });
            }, err => {
                result.resolveDelegate({ key: key, value: promises[key] });
            });
        });
        return result;
    }
}
