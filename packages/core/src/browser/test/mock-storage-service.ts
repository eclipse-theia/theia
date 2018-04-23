/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { StorageService } from '../storage-service';
import { injectable } from 'inversify';

/**
 * A StorageService suitable to use during tests.
 */
@injectable()
export class MockStorageService implements StorageService {
    readonly data = new Map<string, {} | undefined>();

    setData<T>(key: string, data?: T): Promise<void> {
        this.data.set(key, data);

        return Promise.resolve();
    }

    getData<T>(key: string, defaultValue?: T): Promise<T | undefined> {
        return Promise.resolve(this.data.get(key) as T);
    }
}
