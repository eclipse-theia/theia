// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { injectable } from '@theia/core/shared/inversify';

export interface LocalDirectoryHandleRecord {
    name: string;
    handle: FileSystemDirectoryHandle;
}

export const LocalDirectoryHandleStore = Symbol('LocalDirectoryHandleStore');

/**
 * Persists the directory handles of mounted local directories across sessions.
 */
export interface LocalDirectoryHandleStore {
    getAll(): Promise<LocalDirectoryHandleRecord[]>;
    put(record: LocalDirectoryHandleRecord): Promise<void>;
    delete(name: string): Promise<void>;
}

/**
 * Stores the handles in IndexedDB, as `FileSystemDirectoryHandle`s are structured-cloneable but not JSON-serializable.
 * Falls back to memory when IndexedDB is not available.
 */
@injectable()
export class LocalDirectoryHandleStoreImpl implements LocalDirectoryHandleStore {

    protected static readonly DB_NAME = 'theia-local-directories';
    protected static readonly STORE_NAME = 'handles';

    protected readonly fallback = new Map<string, LocalDirectoryHandleRecord>();
    protected database: Promise<IDBDatabase | undefined> | undefined;

    async getAll(): Promise<LocalDirectoryHandleRecord[]> {
        const db = await this.getDatabase();
        if (!db) {
            return Array.from(this.fallback.values());
        }
        return this.request(db, 'readonly', store => store.getAll());
    }

    async put(record: LocalDirectoryHandleRecord): Promise<void> {
        const db = await this.getDatabase();
        if (!db) {
            this.fallback.set(record.name, record);
            return;
        }
        await this.request(db, 'readwrite', store => store.put(record));
    }

    async delete(name: string): Promise<void> {
        const db = await this.getDatabase();
        if (!db) {
            this.fallback.delete(name);
            return;
        }
        await this.request(db, 'readwrite', store => store.delete(name));
    }

    protected getDatabase(): Promise<IDBDatabase | undefined> {
        if (!this.database) {
            this.database = this.openDatabase();
        }
        return this.database;
    }

    protected openDatabase(): Promise<IDBDatabase | undefined> {
        if (typeof indexedDB === 'undefined') {
            return Promise.resolve(undefined);
        }
        return new Promise(resolve => {
            try {
                const request = indexedDB.open(LocalDirectoryHandleStoreImpl.DB_NAME, 1);
                request.onupgradeneeded = () => {
                    request.result.createObjectStore(LocalDirectoryHandleStoreImpl.STORE_NAME, { keyPath: 'name' });
                };
                request.onsuccess = () => resolve(request.result);
                // Private browsing modes may reject the open call, persistence is optional in that case.
                request.onerror = () => resolve(undefined);
                request.onblocked = () => resolve(undefined);
            } catch {
                resolve(undefined);
            }
        });
    }

    protected request<T>(db: IDBDatabase, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(LocalDirectoryHandleStoreImpl.STORE_NAME, mode);
            const request = action(transaction.objectStore(LocalDirectoryHandleStoreImpl.STORE_NAME));
            transaction.oncomplete = () => resolve(request.result);
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
    }
}
