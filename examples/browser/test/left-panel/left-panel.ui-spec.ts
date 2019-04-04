/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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
import { expect } from 'chai';
import { LeftPanel } from './left-panel';
import { MainPage } from '../main-page/main-page';
let leftPanel: LeftPanel;
let mainPage: MainPage;

before(() => {
    const driver = browser;
    const url = '/';

    driver.url(url);
    leftPanel = new LeftPanel(driver);
    mainPage = new MainPage(driver);
    // Make sure that the application shell is loaded
    mainPage.waitForStartup();
});

describe('theia left panel', () => {
    it("should show 'Explorer'", () => {
        expect(leftPanel.doesTabExist('Explorer')).to.be.true;
    });

    describe('files tab', () => {
        it('should open/close the files tab', () => {
            leftPanel.openCloseTab('Explorer');
            expect(leftPanel.isFileTreeVisible()).to.be.true;
            expect(leftPanel.isTabActive('Explorer')).to.be.true;

            leftPanel.openCloseTab('Explorer');
            expect(leftPanel.isFileTreeVisible()).to.be.false;
            expect(leftPanel.isTabActive('Explorer')).to.be.false;
        });
    });
});
