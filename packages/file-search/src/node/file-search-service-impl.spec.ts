/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { expect } from 'chai';
import * as path from 'path';
import { FileSearchServiceImpl } from './file-search-service-impl';
import { FileUri } from '@theia/core/lib/node';
import { Container, ContainerModule } from 'inversify';
import { CancellationTokenSource } from '@theia/core';
import { loggerBackendModule } from '@theia/core/lib/node/logger-backend-module';
import processBackendModule from '@theia/process/lib/node/process-backend-module';

// tslint:disable:no-unused-expression

const testContainer = new Container();

testContainer.load(loggerBackendModule);
testContainer.load(processBackendModule);
testContainer.load(new ContainerModule(bind => {
    bind(FileSearchServiceImpl).toSelf().inSingletonScope();
}));

describe('search-service', function () {

    this.timeout(10000);

    it('shall fuzzy search this spec file', async () => {
        const service = testContainer.get(FileSearchServiceImpl);
        const rootUri = FileUri.create(path.resolve(__dirname, "..")).toString();
        const matches = await service.find('spc', { rootUri });
        const expectedFile = FileUri.create(__filename).displayName;
        const testFile = matches.find(e => e.endsWith(expectedFile));
        expect(testFile).to.be.not.undefined;
    });

    it('shall respect nested .gitignore');
    //     const service = testContainer.get(FileSearchServiceImpl);
    //     const rootUri = FileUri.create(path.resolve(__dirname, "../../test-resources")).toString();
    //     const matches = await service.find('foo', { rootUri, fuzzyMatch: false });

    //     expect(matches.find(match => match.endsWith('subdir1/sub-bar/foo.txt'))).to.be.undefined;
    //     expect(matches.find(match => match.endsWith('subdir1/sub2/foo.txt'))).to.be.not.undefined;
    //     expect(matches.find(match => match.endsWith('subdir1/foo.txt'))).to.be.not.undefined;
    // });

    it('shall cancel searches', async () => {
        const service = testContainer.get(FileSearchServiceImpl);
        const rootUri = FileUri.create(path.resolve(__dirname, "../../../../..")).toString();
        const cancelTokenSource = new CancellationTokenSource();
        cancelTokenSource.cancel();
        const matches = await service.find('foo', { rootUri, fuzzyMatch: false }, cancelTokenSource.token);

        expect(matches).to.be.empty;
    });
});
