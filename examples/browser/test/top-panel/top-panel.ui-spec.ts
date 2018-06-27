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
import { expect } from "chai";
import { TopPanel } from "./top-panel";
import { BottomPanel } from "../bottom-panel/bottom-panel";
import { MainPage } from '../main-page/main-page';
let topPanel: TopPanel;
let bottomPanel: BottomPanel;
let mainPage: MainPage;

before(() => {
    const driver = browser;
    const url = '/';

    driver.url(url);
    driver.localStorage('DELETE');
    driver.refresh();
    topPanel = new TopPanel(driver);
    bottomPanel = new BottomPanel(driver);
    mainPage = new MainPage(driver);
    // Make sure that the application shell is loaded
    mainPage.waitForStartup();
});

describe('theia top panel (menubar)', () => {
    it('should show the top panel', () => {
        expect(topPanel.exists()).to.be.true;
    });

    it('should set a menu item active when hovered', () => {
        topPanel.hoverMenuTab(1);
        expect(topPanel.isTabActive(1)).to.be.true;

        topPanel.hoverMenuTab(2);
        expect(topPanel.isTabActive(1)).to.be.false;
        expect(topPanel.isTabActive(2)).to.be.true;
    });

    it('should show menu correctly when clicked on a tab', () => {
        /* No menu at the start */
        expect(topPanel.isSubMenuVisible()).to.be.false;

        /* Click on the first child */
        topPanel.clickMenuTab(1);
        expect(topPanel.isSubMenuVisible()).to.be.true;

        /* Click again to make the menu disappear */
        topPanel.clickMenuTab(1);
        expect(topPanel.isSubMenuVisible()).to.be.false;

        /* Make sure the menu location is directly under the bar tab */
        topPanel.clickMenuTab(1);
        let tabX = topPanel.getxBarTabPosition(1);
        let menuX = topPanel.getxSubMenuPosition();
        expect(tabX).to.be.equal(menuX);

        /* Test with the second tab by hovering to the second one */
        topPanel.hoverMenuTab(2);
        tabX = topPanel.getxBarTabPosition(2);
        menuX = topPanel.getxSubMenuPosition();
        expect(tabX).to.be.equal(menuX);

        topPanel.clickMenuTab(2);
        expect(topPanel.isSubMenuVisible()).to.be.false;

    });

    describe('terminal UI', () => {
        it('should open a new terminal and then close it', () => {
            if (!bottomPanel.isTerminalVisible()) {
                topPanel.openNewTerminal();
                bottomPanel.waitForTerminal();
            }
            expect(bottomPanel.isTerminalVisible()).to.be.true;

            bottomPanel.closeCurrentView();
            expect(bottomPanel.isTerminalVisible()).to.be.false;
        });
    });

    describe('problems view UI', () => {
        it('should open a new problems view and then close it', () => {
            if (!bottomPanel.isProblemsViewVisible()) {
                topPanel.openProblemsView();
                bottomPanel.waitForProblemsView();
            }
            expect(bottomPanel.isProblemsViewVisible()).to.be.true;

            bottomPanel.closeCurrentView();
            expect(bottomPanel.isProblemsViewVisible()).to.be.false;
        });
    });
});
