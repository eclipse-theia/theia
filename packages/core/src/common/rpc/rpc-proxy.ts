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

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { MaybePromise } from '../types';
import type { CancellationToken } from '../cancellation';
import type { Event } from '../event';

type WithoutPrefix<Prefix extends string, T> =
    T extends `${Prefix}${infer U}` ? U :
    T extends string ? T :
    never;

type EnsureTail<T extends unknown[], Tail extends unknown[]> =
    T extends [] ?
    Tail :
    [...T, ...Tail];

/**
 * Ensure that `T` matches the proxy API naming convention:
 * - `on<Event>` attach listeners to be notified.
 * - `notify<Something>` send a message without waiting for a response.
 * - `<method>Sync` send a synchronous request.
 * - `<method>` send an asynchronous request.
 */
export type Proxyable<T> = {
    // Fields cannot be optional:
    [K in keyof T]-?: (
        // Events:
        WithoutPrefix<'$', K> extends `on${string}` ? (
            T[K] extends Event<any> ? T[K] : Event<any>
        ) :
        // Methods:
        T[K] extends (...params: infer U) => infer V ? (
            // Need to use `[X] extends [Y]` notation to avoid booleans being distributed as `true | false`.
            // See: https://www.typescriptlang.org/docs/handbook/2/conditional-types.html#distributive-conditional-types
            // Methods returning void are allowed for anything:
            [V] extends [void] ? (...params: U) => void :
            // Notification method:
            WithoutPrefix<'$', K> extends `notify${string}` ? (...params: U) => void :
            // Synchronous method:
            K extends `${string}Sync` ? (...params: U) => [V] extends [MaybePromise<infer W>] ? W : never :
            // Asynchonous method:
            (...params: EnsureTail<U, [cancel?: CancellationToken]>) => [V] extends [MaybePromise<infer W>] ? Promise<W> : never
        ) :
        // Expect functions for everything else:
        (...params: any[]) => any
    )
};
