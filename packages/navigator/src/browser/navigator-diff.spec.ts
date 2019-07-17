/********************************************************************************
 * Copyright (C) 2019 David Saunders and others.
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
/* tslint:disable:no-unused-expression*/
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { NavigatorDiff } from './navigator-diff';
import * as path from 'path';
import { Container, ContainerModule } from 'inversify';
import { SelectionService, ILogger } from '@theia/core/lib/common';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import URI from '@theia/core/lib/common/uri';
import { FileSystem } from '@theia/filesystem/lib/common';
import { OpenerService } from '@theia/core/lib/browser';
import { MockOpenerService } from '@theia/core/lib/browser/test/mock-opener-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import { MessageClient } from '@theia/core/lib/common/message-service-protocol';
import { FileSystemNode } from '@theia/filesystem/lib/node/node-filesystem';
import { FileUri } from '@theia/core/lib/node/file-uri';

disableJSDOM();

let testContainer: Container;
beforeEach(() => {
    testContainer = new Container();

    const module = new ContainerModule((bind, unbind, isBound, rebind) => {
        bind(ILogger).to(MockLogger).inSingletonScope();
        bind(SelectionService).toSelf().inSingletonScope();
        bind(NavigatorDiff).toSelf().inSingletonScope();
        bind(OpenerService).to(MockOpenerService);
        bind(FileSystem).to(FileSystemNode).inSingletonScope();
        bind(MessageService).toSelf().inSingletonScope();
        bind(MessageClient).toSelf().inSingletonScope();
    });

    testContainer.load(module);
});

describe('NavigatorDiff', () => {
    it('should allow a valid first file to be added', done => {
        const diff = testContainer.get(NavigatorDiff);
        testContainer.get(SelectionService).selection = [{
            uri: new URI(FileUri.create(path.resolve(__dirname, '../../test-resources/testFileA.json')).toString())
        }];

        diff.addFirstComparisonFile()
            .then(result => {
                expect(result).to.be.true;
                done();
            });
    });

    it('should reject invalid file when added', done => {
        const diff = testContainer.get(NavigatorDiff);
        testContainer.get(SelectionService).selection = [{
            uri: new URI(FileUri.create(path.resolve(__dirname, '../../test-resources/nonExistantFile.json')).toString())
        }];

        diff.addFirstComparisonFile()
            .then(result => {
                expect(result).to.be.false;
                done();
            });
    });

    it('should run comparison when second file is added', done => {
        const diff = testContainer.get(NavigatorDiff);
        testContainer.get(SelectionService).selection = [{
            uri: new URI(FileUri.create(path.resolve(__dirname, '../../test-resources/testFileA.json')).toString())
        }];

        diff.addFirstComparisonFile()
            .then(result => {
                testContainer.get(SelectionService).selection = [{
                    uri: new URI(FileUri.create(path.resolve(__dirname, '../../test-resources/testFileB.json')).toString())
                }];

                diff.compareFiles()
                    .then(compareResult => {
                        expect(compareResult).to.be.true;
                        done();
                    });
            });
    });

    it('should fail to run comparison if first file not added', done => {
        const diff = testContainer.get(NavigatorDiff);
        testContainer.get(SelectionService).selection = [{
            uri: new URI(FileUri.create(path.resolve(__dirname, '../../test-resources/testFileA.json')).toString())
        }];

        diff.compareFiles()
            .then(compareResult => {
                expect(compareResult).to.be.false;
                done();
            });
    });
});
