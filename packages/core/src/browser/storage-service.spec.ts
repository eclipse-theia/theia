/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';

import { Container } from 'inversify';
import { LocalStorageService, StorageService } from './storage-service';
import { ILogger } from '../common/logger';
import { MockLogger } from '../common/test/mock-logger';

let storageService: StorageService;

beforeAll(() => {
    const testContainer = new Container();
    testContainer.bind(ILogger).toDynamicValue(ctx => new MockLogger());
    testContainer.bind(StorageService).to(LocalStorageService).inSingletonScope();
    testContainer.bind(LocalStorageService).toSelf().inSingletonScope();

    storageService = testContainer.get(StorageService);
});

describe("storage-service", () => {

    test("stores data", async () => {
        storageService.setData('foo', {
            test: 'foo'
        });
        expect(await storageService.getData('bar', 'bar')).toEqual('bar');
        expect((await storageService.getData('foo', {
            test: 'bar'
        })).test).toEqual('foo');
    });

    test("removes data", async () => {
        storageService.setData('foo', {
            test: 'foo'
        });
        expect((await storageService.getData('foo', {
            test: 'bar'
        })).test).toEqual('foo');

        storageService.setData('foo', undefined);
        expect((await storageService.getData('foo', {
            test: 'bar'
        })).test).toEqual('bar');
    });

});
