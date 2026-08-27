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

import { ILogger } from '@theia/core';

/** The Web Locks API of this browsing context, or `undefined` in an insecure context or an older browser. */
export function getWebLocks(): LockManager | undefined {
    return typeof navigator === 'object' ? navigator.locks : undefined;
}

/**
 * Requests `name` from `locks` and runs `callback` once granted, same as `LockManager.request()`.
 *
 * `LockGrantedCallback` is typed as `(lock: Lock | null) => T`, which doesn't account for an
 * async or never-settling callback even though the API itself supports and awaits one - this
 * just wraps the cast in one place instead of at every call site.
 */
export function requestLock<T>(locks: LockManager, name: string, callback: () => T | PromiseLike<T>): Promise<T> {
    return locks.request<T>(name, callback as unknown as LockGrantedCallback<T>);
}

/** Logs via `logger.warn` the first time {@link warn} is called, and does nothing after that. */
export class WarnOnce {
    protected warned = false;

    warn(logger: ILogger, message: string): void {
        if (!this.warned) {
            this.warned = true;
            logger.warn(message);
        }
    }
}
