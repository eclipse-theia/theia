/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';

import * as path from 'path';
import { FileSearchServiceImpl } from './file-search-service-impl';
import { FileUri } from '@theia/core/lib/node';
import { Container, ContainerModule } from 'inversify';
import { loggerBackendModule } from '@theia/core/lib/node/logger-backend-module';
import processBackendModule from '@theia/process/lib/node/process-backend-module';
import { CancellationTokenSource } from 'vscode-ws-jsonrpc/lib';

// tslint:disable:no-unused-expression

const testContainer = new Container();

testContainer.load(loggerBackendModule);
testContainer.load(processBackendModule);
testContainer.load(new ContainerModule(bind => {
    bind(FileSearchServiceImpl).toSelf().inSingletonScope();
}));

describe('search-service', () => {
    test('shall fuzzy search this spec file', async () => {
        const service = testContainer.get(FileSearchServiceImpl);
        const rootUri = FileUri.create(path.resolve(__dirname, "..")).toString();
        const matches = await service.find('spc', { rootUri });
        const expectedFile = FileUri.create(__filename).displayName;
        const testFile = matches.find(e => e.endsWith(expectedFile));
        expect(testFile).toBeDefined();
    }, 10000);

    test.skip('shall respect nested .gitignore', async () => {
        const service = testContainer.get(FileSearchServiceImpl);
        const rootUri = FileUri.create(path.resolve(__dirname, "../../test-resources")).toString();
        const matches = await service.find('foo', { rootUri, fuzzyMatch: false });

        expect(matches.find(match => match.endsWith('subdir1/sub-bar/foo.txt'))).toBeUndefined();
        expect(matches.find(match => match.endsWith('subdir1/sub2/foo.txt'))).toBeDefined();
        expect(matches.find(match => match.endsWith('subdir1/foo.txt'))).toBeDefined();
    });

    test('shall cancel searches', async () => {
        const service = testContainer.get(FileSearchServiceImpl);
        const rootUri = FileUri.create(path.resolve(__dirname, "../../../../..")).toString();
        const cancelTokenSource = new CancellationTokenSource();
        cancelTokenSource.cancel();
        const matches = await service.find('foo', { rootUri, fuzzyMatch: false }, cancelTokenSource.token);

        expect(matches).toHaveLength(0);
    }, 10000);
});
