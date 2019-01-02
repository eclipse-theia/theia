/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

import * as utils from '../utils';
import * as fs from 'fs';
import * as path from 'path';
import { expect } from 'chai';
import { MainPage } from '../main-page/main-page';
import { SearchInWorkspace } from './search-in-workspace';

let driver: WebdriverIO.Client<void>;

let mainPage: MainPage;
let searchInWorkpace: SearchInWorkspace;

describe('workspace', () => {

    before(() => {

        // initialize test driver
        driver = browser;

        // perform application cleanup
        driver.url('/');
        driver.localStorage('DELETE');
        driver.refresh();

        // prepare workspace with test files
        prepareWorkspace();

        // initialize the main page, and wait for application to startup
        mainPage = new MainPage(driver);
        searchInWorkpace = new SearchInWorkspace(driver);
        mainPage.waitForStartup();
    });

    describe('search-in-workspace', () => {
        afterEach(() => {
            searchInWorkpace.clear();
        });
        it('should search `test a` and find a single result', () => {
            const result = searchInWorkpace.search('test a');
            expect(result).to.equal('1 result in 1 file');
        });
        it('should search `test` and find multiple results', () => {
            const result = searchInWorkpace.search('test');
            expect(result).to.equal('4 results in 4 files');
        });
        it('should search a non-existing term and not find results', () => {
            const result = searchInWorkpace.search('foobar');
            expect(result).to.equal('No results found.');
        });
        it('should search `test d` and find results using an include_glob', () => {
            const result = searchInWorkpace.search('test d', 'foo/**');
            expect(result).to.equal('1 result in 1 file');
        });
        it('should search `test d` and not find results with an incorrect include_glob', () => {
            const result = searchInWorkpace.search('test d', 'bar/**');
            expect(result).to.equal("No results found in 'bar/**'");
        });
        it('should search a non-existing term and not find results with an incorrect include_glob', () => {
            const result = searchInWorkpace.search('foobar', 'bar/**');
            expect(result).to.equal("No results found in 'bar/**'");
        });
        it('should search `test`, excluding python files and return no results', () => {
            const result = searchInWorkpace.search('test', 'foo/**', '*.py');
            expect(result).to.equal("No results found in 'foo/**'");
        });
    });
});

/**
 * Prepare test workspace with test files.
 *
 * test-workspace
 *  │  a.py
 *  │  b.py
 *  │  c.py
 *  └  foo
 *    │  d.py
 */
function prepareWorkspace(): void {

    // create temporary workspace test workspace
    const root = path.join(utils.getWorkspaceRoot());
    const workspace = path.join(root, 'test-workspace');
    const subFolder = path.join(workspace, 'foo');
    fs.mkdirSync(workspace);
    fs.mkdirSync(subFolder);

    // add test files to workspace
    fs.writeFileSync(path.join(workspace, 'a.py'),
        `
        # test a
        print('a')
        `
    );

    fs.writeFileSync(path.join(workspace, 'b.py'),
        `
        # test b
        print('b')
        `
    );

    fs.writeFileSync(path.join(workspace, 'c.py'),
        `
        # test c
        print('c')
        `
    );

    fs.writeFileSync(path.join(subFolder, 'd.py'),
        `
        # test d
        print('d')
        `
    );
}
