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
import { MainPage } from './main-page';
import { expect } from 'chai';

let mainPage: MainPage;
let driver: WebdriverIO.Client<void>;

describe('theia main page', () => {

    before(() => {
        const url = '/';
        driver = browser;
        driver.url(url);
        mainPage = new MainPage(driver);
        // Make sure that the application shell is loaded
        mainPage.waitForStartup();
    });

    it('should show the application shell', () => {
        expect(mainPage.applicationShellExists()).to.be.true;
    });

    it('should show the main content panel', () => {
        expect(mainPage.mainContentPanelExists()).to.be.true;
    });

    it('should show the left and right sidebars', () => {
        expect(mainPage.rightSideBarExists() && mainPage.leftSideBarExists()).to.be.true;
    });

    it('should show the status bar', () => {
        expect(mainPage.statusBarExists()).to.be.true;
    });
});
