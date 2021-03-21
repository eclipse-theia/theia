/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import { StorageService } from '../storage-service';
import { injectable } from 'inversify';

/**
 * A StorageService suitable to use during tests.
 */
@injectable()
export class MockStorageService implements StorageService {
    readonly data = new Map<string, {} | undefined>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onSetDataCallback?: (key: string, data?: any) => void;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onSetData(callback: (key: string, data?: any) => void): void {
        this.onSetDataCallback = callback;
    }

    setData<T>(key: string, data?: T): Promise<void> {
        this.data.set(key, data);
        if (this.onSetDataCallback) {
            this.onSetDataCallback(key, data);
        }
        return Promise.resolve();
    }

    getData<T>(key: string, defaultValue?: T): Promise<T | undefined> {
        if (this.data.has(key)) {
            return Promise.resolve(this.data.get(key) as T);
        }
        return Promise.resolve(defaultValue);
    }
}
