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
}
