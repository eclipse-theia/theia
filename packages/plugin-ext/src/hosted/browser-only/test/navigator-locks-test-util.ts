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
// ****************************************************************************

/**
 * The subset of `LockManager` that the fakes in these tests actually implement. The real
 * `LockManager.request()` is overloaded with an optional `options` parameter that none of our
 * fakes need, so typing {@link installFakeLockManager} directly against the DOM `LockManager`
 * interface would reject every fake as an incompatible overload - we cast to the real type just
 * once instead, at the point where the fake gets installed as `navigator.locks`.
 */
export interface FakeLockManager {
    request<T>(name: string, callback: () => T | PromiseLike<T>): Promise<T>;
    query?(): Promise<{ held?: Array<{ name?: string }> }>;
}

/**
 * Installs `manager` as `navigator.locks` and returns a function that restores whatever was
 * there before. Doesn't assume `navigator` is even defined: `enableJSDOM()`/`disableJSDOM()`
 * (see `packages/core/src/browser/test/jsdom.ts`) deletes the global `navigator` that Node
 * normally provides as a side effect of disabling jsdom, and depending on which spec files ran
 * earlier in this mocha process, it may already be gone by the time a test runs.
 */
export function installFakeLockManager(manager: FakeLockManager): () => void {
    const target = globalThis as { navigator?: { locks?: unknown } };
    const hadNavigator = typeof navigator !== 'undefined';
    if (!hadNavigator) {
        Object.defineProperty(target, 'navigator', { value: {}, configurable: true });
    }
    const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');
    Object.defineProperty(navigator, 'locks', { value: manager as unknown as LockManager, configurable: true });

    return () => {
        if (!hadNavigator) {
            delete target.navigator;
        } else if (originalLocks) {
            Object.defineProperty(navigator, 'locks', originalLocks);
        } else {
            delete (navigator as { locks?: unknown }).locks;
        }
    };
}
