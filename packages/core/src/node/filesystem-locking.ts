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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Mutex } from 'async-mutex';
import { injectable, interfaces } from 'inversify';
import * as path from 'path';

export const FileSystemLocking = Symbol('FileSystemLocking') as symbol & interfaces.Abstract<FileSystemLocking>;
/**
 * Use this backend service to help prevent race access to files on disk.
 */
export interface FileSystemLocking {
    /**
     * Get exclusive access to a file for reading and/or writing.
     * @param lockPath The path to request exclusive access to.
     * @param transaction The job to do while having exclusive access.
     * @param thisArg `this` argument used when calling `transaction`.
     */
    lockPath<T>(lockPath: string, transaction: (lockPath: string) => T | Promise<T>, thisArg?: unknown): Promise<T>;
}

@injectable()
export class FileSystemLockingImpl implements FileSystemLocking {

    lockPath<T>(lockPath: string, transaction: (lockPath: string) => T | Promise<T>, thisArg?: unknown): Promise<T> {
        const resolvedLockPath = this.resolveLockPath(lockPath);
        return this.getLock(resolvedLockPath).runExclusive(async () => transaction.call(thisArg, resolvedLockPath));
    }

    protected resolveLockPath(lockPath: string): string {
        // try to normalize the path to avoid two paths pointing to the same file
        return path.resolve(lockPath);
    }

    protected getLocks(): Map<string, Mutex> {
        const kLocks = Symbol.for('FileSystemLockingImpl.Locks');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (globalThis as any)[kLocks] ??= this.initializeLocks();
    }

    protected initializeLocks(): Map<string, Mutex> {
        const locks = new Map();
        const cleanup = setInterval(() => this.cleanupLocks(locks), 60_000);
        process.once('beforeExit', () => clearInterval(cleanup));
        return locks;
    }

    protected cleanupLocks(locks: Map<string, Mutex>): void {
        locks.forEach((lock, lockPath) => {
            if (!lock.isLocked()) {
                locks.delete(lockPath);
            }
        });
    }

    protected getLock(lockPath: string): Mutex {
        const locks = this.getLocks();
        let lock = locks.get(lockPath);
        if (!lock) {
            locks.set(lockPath, lock = new Mutex());
        }
        return lock;
    }
}
