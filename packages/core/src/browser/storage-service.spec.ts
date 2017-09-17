/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { LocalStorageService, StorageService } from './storage-service';
import * as assert from 'assert';
import { TestLogger } from '../common/test/test-logger';

let storageService: StorageService;

before(() => {
    storageService = new LocalStorageService(new TestLogger());
});

describe("storage-service", () => {

    it("stores data", async () => {
        storageService.setData('foo', {
            test: 'foo'
        });
        assert(await storageService.getData('bar', 'bar') === 'bar');
        assert((await storageService.getData('foo', {
            test: 'bar'
        })).test === 'foo');
    });

    it("removes data", async () => {
        storageService.setData('foo', {
            test: 'foo'
        });
        assert((await storageService.getData('foo', {
            test: 'bar'
        })).test === 'foo');

        storageService.setData('foo', undefined);
        assert((await storageService.getData('foo', {
            test: 'bar'
        })).test === 'bar');
    });

});
