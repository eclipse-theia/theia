/********************************************************************************
 * Copyright (C) 2021 Red Hat and others.
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

import { inject } from 'inversify';
import { ILogger } from './logger';
import { Deferred } from './promise-util';

class LockTokenImpl {
    private static next_token_id: number = 0;

    id: number;

    constructor(readonly deferred: Deferred<number>) {
        this.id = LockTokenImpl.next_token_id++;
    }

    release(): void {
        this.deferred.resolve(this.id);
    }
}

/**
 * Implements a mutual exclusion lock that prevents different promise chains from
 * executing in parallel.
 * For mutual exclusion, a lock token must be acquired at the beginning of parallel
 * promise chains:
 *
 * const lock = new Lock();
 *
 * function parallelWork() {
 *   const token = await lock.acquire();
 *   try {
 *    await somePromise;
 *     await someOtherPromise;
 *   } finally {
 *     lock.release(token);
 *   }
 * }
 */
export class Lock {
    @inject(ILogger)
    protected log: ILogger;

    private waiters: LockTokenImpl[] = [];

    /**
     * Returns a promise that will resolve when the lock is considered to be acquired
     * @returns a promise that will resolve to a lock token.
     */
    acquire(): Promise<number> {
        const deferred: Deferred<number> = new Deferred();
        const token = new LockTokenImpl(deferred);

        this.waiters.push(token);
        this.log.debug(`acquiring lock ${token.id}: blocking= ${this.waiters.length === 1}`);

        if (this.waiters.length === 1) {
            deferred.resolve(token.id);
        }

        return deferred.promise;
    }

    /**
     * Releases the lock. Note that multiple releases with the same token are a no-op.
     * @param token the token obtained from #acquire().
     */
    release(token: number): void {
        this.log.debug(`releasing lock ${token}`);
        const tokenIndex = this.waiters.findIndex(aToken => aToken.id === token);
        if (tokenIndex < 0) {
            this.log.info(`double release of lock token ${token}`);
            return;
        }

        this.waiters.splice(tokenIndex, 1);
        if (this.waiters.length > 0) {
            this.log.debug(`unblocking lock ${this.waiters[0].id}`);
            this.waiters[0].release();
        }
    }
}
