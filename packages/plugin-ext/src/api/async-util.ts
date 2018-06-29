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
import { CancellationToken } from '@theia/core/lib/common/cancellation';
import { Deferred } from '@theia/core/lib/common/promise-util';

export function hookCancellationToken<T>(token: CancellationToken, promise: Promise<T>): PromiseLike<T> {
    return new Promise<T>((resolve, reject) => {
        const sub = token.onCancellationRequested(() => reject("This promise is cancelled"));
        promise.then(value => {
            sub.dispose();
            resolve(value);
        }).catch(err => {
            sub.dispose();
            reject(err);
        });
    });
}

export function anyPromise<T>(promises: PromiseLike<T>[]): Promise<{ key: number; value: PromiseLike<T>; }> {
    const result = new Deferred<{ key: number; value: PromiseLike<T>; }>();
    if (promises.length === 0) {
        result.resolve();
    }

    promises.forEach((val, key) => {
        Promise.resolve(promises[key]).then(() => {
            result.resolve({ key: key, value: promises[key] });
        }, err => {
            result.resolve({ key: key, value: promises[key] });
        });
    });
    return result.promise;
}
