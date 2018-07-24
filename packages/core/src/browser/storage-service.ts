/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { inject, injectable } from 'inversify';
import { ILogger } from '../common/logger';
import URI from '../common/uri';

export const StorageService = Symbol('IStorageService');
/**
 * The storage service provides an interface to some data storage that allows extensions to keep state among sessions.
 */
export interface StorageService {

    /**
     * Stores the given data under the given key.
     */
    setData<T>(key: string, data: T): Promise<void>;

    /**
     * Returns the data stored for the given key or the provided default value if nothing is stored for the given key.
     */
    getData<T>(key: string, defaultValue: T): Promise<T>;
    getData<T>(key: string): Promise<T | undefined>;

    /**
     * Verify if the data stored in local storage is still valid
     */
    verifyLocalStorage(): Promise<string[] | undefined>;
    cleanLocalStorage(path: string): void
}

interface LocalStorage {
    // tslint:disable-next-line:no-any
    [key: string]: any;
}

@injectable()
export class LocalStorageService implements StorageService {
    private storage: LocalStorage;

    constructor(
        @inject(ILogger) protected logger: ILogger
    ) {
        if (typeof window !== 'undefined' && window.localStorage) {
            this.storage = window.localStorage;
        } else {
            logger.warn(log => log("The browser doesn't support localStorage. state will not be persisted across sessions."));
            this.storage = {};
        }
    }

    setData<T>(key: string, data?: T): Promise<void> {
        if (data !== undefined) {
            this.storage[this.prefix(key)] = JSON.stringify(data);
        } else {
            delete this.storage[this.prefix(key)];
        }
        return Promise.resolve();
    }

    getData<T>(key: string, defaultValue?: T): Promise<T | undefined> {
        const result = this.storage[this.prefix(key)];
        if (result === undefined) {
            return Promise.resolve(defaultValue);
        }
        return Promise.resolve(JSON.parse(result));
    }

    protected prefix(key: string): string {
        const pathname = typeof window === 'undefined' ? '' : window.location.pathname;
        return `theia:${pathname}:${key}`;
    }

    verifyLocalStorage(): Promise<string[] | undefined> {

        const list = new Set();
        for (let count = 0; count < this.storage.length; count++) {
            const key = this.storage.key(count);
            const shortKey = this.removePrefix(key);
            const fileToCheck = this.getFilePath(shortKey);
            if (fileToCheck) {
                list.add(fileToCheck);
            }
        }
        return Promise.resolve(Array.from(list));
    }

    cleanLocalStorage(path: string): void {
        for (let count = 0; count < this.storage.length; count++) {
            const key = this.storage.key(count);
            if (key.indexOf(`${path}:`) !== -1) {
                this.storage.removeItem(key);
                count--;
            }
        }
    }

    protected removePrefix(key: string): string {
        const prefix = this.prefix('').trim();
        const shortKey = key.replace(prefix, '');
        return shortKey;
    }

    protected getFilePath(value: string): string | undefined {
        const prefix = 'file:/';
        const lastSep = value.lastIndexOf(':');
        let uri: URI | undefined;
        if (value.startsWith(prefix)) {
            const file = value.slice(0, lastSep);
            uri = new URI(file);
        }
        if (!!uri) {
            return uri.path.toString();
        }
        return uri;
    }

}
