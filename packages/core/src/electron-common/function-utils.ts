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

import { injectable } from 'inversify';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFunction = (...params: any[]) => any;

/**
 * Utility to bind functions and preserve indentity.
 *
 * @example
 *
 * class Foo {
 *     protected buzz = 2;
 *     bar() {
 *         return this.buzz;
 *     }
 * }
 * const instance = new Foo();
 * // Identity is lost even when binding twice to the same reference:
 * instance.bar.bind(instance) !== instance.bar.bind(instance);
 * // Identity is conversed when using FunctionUtils.bindfn:
 * futils.bindfn(instance.bar, instance) === futils.bindfn(instance.bar, instance);
 */
@injectable()
export class FunctionUtils {

    /** callbackfn => thisArg => boundfn */
    protected boundfnCache = new WeakMap<AnyFunction, WeakMap<object, AnyFunction>>();
    /** callbackfn => mapfn => mappedfn */
    protected mappedfnCache = new WeakMap<AnyFunction, WeakMap<AnyFunction, AnyFunction>>();

    bindfn<T extends AnyFunction>(callbackfn: T, thisArg?: object): T {
        if (!thisArg) {
            return callbackfn;
        }
        // We need to preserve the callback's identity based on the
        // (callbackfn, thisArg) pair.
        let boundfns = this.boundfnCache.get(callbackfn);
        if (!boundfns) {
            this.boundfnCache.set(callbackfn, boundfns = new WeakMap());
        }
        let boundfn = boundfns.get(thisArg);
        if (!boundfn) {
            boundfns.set(thisArg, boundfn = callbackfn.bind(thisArg));
        }
        return boundfn as T;
    }

    mapfn<T extends AnyFunction, U extends AnyFunction>(callbackfn: T, mapfn: (callbackfn: T) => U): U {
        // We need to preserve the callback's identity based on the
        // (callbackfn, mapfn) pair.
        let mappedfns = this.mappedfnCache.get(callbackfn);
        if (!mappedfns) {
            this.mappedfnCache.set(callbackfn, mappedfns = new WeakMap());
        }
        let mappedfn = mappedfns.get(mapfn);
        if (!mappedfn) {
            mappedfns.set(mapfn, mappedfn = mapfn(callbackfn));
        }
        return mappedfn as U;
    }
}
