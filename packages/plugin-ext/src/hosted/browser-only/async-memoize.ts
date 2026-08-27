// *****************************************************************************
// Copyright (C) 2026 robertjndw
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

/**
 * Caches the result of `compute` after the first call. On rejection, the cache is cleared so the
 * next call retries instead of replaying the same failure forever.
 */
export function memoizeAsync<T>(compute: () => Promise<T>): () => Promise<T> {
    let cached: Promise<T> | undefined;
    return () => cached ??= compute().catch(error => {
        cached = undefined;
        throw error;
    });
}

/**
 * Same as {@link memoizeAsync}, but keyed - one cached result per distinct `keyOf(args)`. Useful
 * when `args` itself isn't suitable as a `Map` key, e.g. an object or an array.
 */
export function memoizeAsyncByKey<Args, T>(compute: (args: Args) => Promise<T>, keyOf: (args: Args) => string): (args: Args) => Promise<T> {
    const cache = new Map<string, Promise<T>>();
    return args => {
        const key = keyOf(args);
        let cached = cache.get(key);
        if (!cached) {
            cached = compute(args).catch(error => {
                cache.delete(key);
                throw error;
            });
            cache.set(key, cached);
        }
        return cached;
    };
}
