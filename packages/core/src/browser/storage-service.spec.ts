/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Container } from 'inversify';
import { LocalStorageService, StorageService } from './storage-service';
import { expect } from 'chai';
import { ILogger } from '../common/logger';
import { MockLogger } from '../common/test/mock-logger';
import * as sinon from 'sinon';

let storageService: StorageService;

before(() => {
    const testContainer = new Container();
    testContainer.bind(ILogger).toDynamicValue(ctx => {
        const logger = new MockLogger();
        /* Note this is not really needed but here we could just use the
        MockLogger since it does what we need but this is there as a demo of
        sinon for other uses-cases. We can remove this once this technique is
        more generally used. */
        sinon.stub(logger, 'warn').callsFake(() => { });
        return logger;
    });
    testContainer.bind(StorageService).to(LocalStorageService).inSingletonScope();
    testContainer.bind(LocalStorageService).toSelf().inSingletonScope();

    storageService = testContainer.get(StorageService);
});

describe("storage-service", () => {

    it("stores data", async () => {
        storageService.setData('foo', {
            test: 'foo'
        });
        expect(await storageService.getData('bar', 'bar')).equals('bar');
        expect((await storageService.getData('foo', {
            test: 'bar'
        })).test).equals('foo');
    });

    it("removes data", async () => {
        storageService.setData('foo', {
            test: 'foo'
        });
        expect((await storageService.getData('foo', {
            test: 'bar'
        })).test).equals('foo');

        storageService.setData('foo', undefined);
        expect((await storageService.getData('foo', {
            test: 'bar'
        })).test).equals('bar');
    });

});
