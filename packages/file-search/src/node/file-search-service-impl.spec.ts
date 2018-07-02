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

import { expect } from 'chai';
import * as path from 'path';
import { FileSearchServiceImpl } from './file-search-service-impl';
import { FileUri } from '@theia/core/lib/node';
import { Container, ContainerModule } from 'inversify';
import { CancellationTokenSource } from '@theia/core';
import { bindLogger } from '@theia/core/lib/node/logger-backend-module';
import processBackendModule from '@theia/process/lib/node/process-backend-module';

// tslint:disable:no-unused-expression

const testContainer = new Container();

bindLogger(testContainer.bind.bind(testContainer));
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
