/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

// tslint:disable:no-unused-expression

import { expect } from 'chai';

import { TopPanel } from './top-panel';
import { MainPanel } from './main-panel';
import { LeftPanel } from './left-panel';
import { RightPanel } from './right-panel';
import { BottomPanel } from './bottom-panel';

let topPanel: TopPanel;
let mainPanel: MainPanel;
let leftPanel: LeftPanel;
let rightPanel: RightPanel;
let bottomPanel: BottomPanel;

describe('theia panels', function () {

    before(() => {

        const driver = browser;
        const url = '/';

        driver.url(url);
        driver.localStorage('DELETE');
        driver.refresh();

        topPanel = new TopPanel(driver);
        mainPanel = new MainPanel(driver);
        leftPanel = new LeftPanel(driver);
        rightPanel = new RightPanel(driver);
        bottomPanel = new BottomPanel(driver);

        console.log(leftPanel, rightPanel, topPanel, bottomPanel);

        mainPanel.waitForStartup();
    });

    describe('theia main panel', function () {
        it('should show the application shell.', () => {
            mainPanel.waitForAppShell();
            expect(mainPanel.appShellExists()).to.be.true;
        });
        it('should show the main content panel.', () => {
            mainPanel.waitForMainContentPanel();
            expect(mainPanel.mainContentPanelExists()).to.be.true;
        });
        it('should show the left sidebar.', () => {
            mainPanel.waitForLeftSidebar();
            expect(mainPanel.leftSidebarExists()).to.be.true;
        });
        it('should show the right sidebar.', () => {
            mainPanel.waitForRightSidebar();
            expect(mainPanel.rightSidebarExists()).to.be.true;
        });
        it('should show the status bar.', () => {
            mainPanel.waitForStatusBar();
            expect(mainPanel.statusBarExists()).to.be.true;
        });
    });

    describe('theia main content panel', function () {

        const GETTING_STARTED = 'Getting Started';

        describe(`'${GETTING_STARTED}'`, () => {
            it(`should open '${GETTING_STARTED}' from the menu.`, () => {
                if (!mainPanel.gettingStartedExists()) {
                    topPanel.openGettingStarted();
                    mainPanel.gettingStartedExists();
                }
                expect(mainPanel.gettingStartedExists()).to.be.true;
            });
        });
    });

    describe('theia left panel', function () {

        const GIT = 'Git';
        const DEBUG = 'Debug';
        const FILES = 'Files';
        const SEARCH = 'Search';
        const PLUGINS = 'Plugins';
        const EXTENSIONS = 'Extensions';
        const GIT_HISTORY = 'Git History';

        describe('on startup', () => {
            it(`should show '${GIT}'`, () => {
                expect(leftPanel.tabExists(GIT)).to.be.true;
            });
            it(`should show '${FILES}'`, () => {
                expect(leftPanel.tabExists(FILES)).to.be.true;
            });
            it(`should show '${SEARCH}'`, () => {
                expect(leftPanel.tabExists(SEARCH)).to.be.true;
            });
        });

        describe(`'${GIT}'`, () => {
            it(`should open '${GIT}' from the menu.`, () => {
                if (!leftPanel.isGitContainerVisible()) {
                    topPanel.toggleGitView();
                    leftPanel.waitForGitContainer();
                }
                expect(leftPanel.tabExists(GIT)).to.be.true;
            });
        });

        describe(`'${DEBUG}'`, () => {
            it(`should open '${DEBUG}' from the menu.`, () => {
                if (!leftPanel.isDebugViewVisible()) {
                    topPanel.toggleDebugView();
                    leftPanel.waitForDebugView();
                }
                expect(leftPanel.tabExists(DEBUG)).to.be.true;
            });
        });

        describe(`'${FILES}'`, () => {
            it(`should open '${FILES}' from the menu.`, () => {
                if (!leftPanel.isFileViewVisible()) {
                    topPanel.toggleFilesView();
                    leftPanel.waitForFilesView();
                }
                expect(leftPanel.tabExists(FILES)).to.be.true;
            });
        });

        describe(`'${SEARCH}'`, () => {
            it(`should open '${SEARCH}' from the menu.`, () => {
                if (!leftPanel.isSearchViewVisible()) {
                    topPanel.toggleSearchView();
                    leftPanel.waitForSearchView();
                }
                expect(leftPanel.tabExists(SEARCH)).to.be.true;
            });
        });

        describe(`'${PLUGINS}'`, () => {
            it(`should open '${PLUGINS}' from the menu.`, () => {
                if (!leftPanel.isPluginsViewVisible()) {
                    topPanel.openPluginsView();
                    leftPanel.waitForPluginsView();
                }
                expect(leftPanel.tabExists(PLUGINS)).to.be.true;
            });
        });

        describe(`'${EXTENSIONS}'`, () => {
            it(`should open '${EXTENSIONS}' from the menu.`, () => {
                if (!leftPanel.isExtensionsContainerVisible()) {
                    topPanel.toggleExtensionsView();
                    leftPanel.waitForExtensionsView();
                }
                expect(leftPanel.tabExists(EXTENSIONS)).to.be.true;
            });
        });

        describe(`'${GIT_HISTORY}'`, () => {
            it(`should open '${GIT_HISTORY}' from the menu.`, () => {
                if (!leftPanel.isGitHistoryVisible()) {
                    topPanel.toggleGitHistoryView();
                    leftPanel.waitForGitHistory();
                }
                expect(leftPanel.tabExists(GIT_HISTORY)).to.be.true;
            });
        });
    });

    describe('theia right panel', function () {

        const OUTLINE = 'Outline';

        describe('on startup', () => {
            it(`should show '${OUTLINE}'`, () => {
                expect(rightPanel.tabExists(OUTLINE)).to.be.true;
            });
        });

        describe(`'${OUTLINE}'`, () => {
            it(`should open '${OUTLINE}' from the menu.`, () => {
                if (!rightPanel.isOutlineViewVisible()) {
                    topPanel.toggleOutlineView();
                    rightPanel.waitForOutlineView();
                }
                expect(rightPanel.tabExists(OUTLINE)).to.be.true;
            });
        });
    });

    describe('theia bottom panel', function () {

        const OUTPUT = 'Output';
        const PROBLEMS = 'Problems';
        const TERMINAL = 'Terminal';
        const DEBUG_CONSOLE = 'Debug Console';
        const CALL_HIERARCHY = 'Call Hierarchy';

        describe(`'${OUTPUT}'`, () => {
            it(`should show '${OUTPUT}' from the menu.`, () => {
                if (!bottomPanel.outputViewExists()) {
                    topPanel.toggleOutputView();
                    bottomPanel.waitForOutputView();
                }
                expect(bottomPanel.outputViewExists()).to.be.true;
            });
        });

        describe(`'${PROBLEMS}'`, () => {
            it(`should show '${PROBLEMS}' from the menu.`, () => {
                if (!bottomPanel.problemsViewExists()) {
                    topPanel.openProblemsView();
                    bottomPanel.waitForProblemsView();
                }
                expect(bottomPanel.problemsViewExists()).to.be.true;
            });
        });

        describe(`'${TERMINAL}'`, () => {
            it(`should show '${TERMINAL}' from the menu.`, () => {
                if (!bottomPanel.terminalExists()) {
                    topPanel.openNewTerminal();
                    bottomPanel.waitForTerminalView();
                }
                expect(bottomPanel.terminalExists()).to.be.true;
            });
        });

        describe(`'${DEBUG_CONSOLE}'`, () => {
            it(`should show '${DEBUG_CONSOLE}' from the menu.`, () => {
                if (!bottomPanel.debugConsoleExists()) {
                    topPanel.toggleDebugConsole();
                    bottomPanel.waitForDebugConsoleView();
                }
                expect(bottomPanel.debugConsoleExists()).to.be.true;
            });
        });

        describe(`'${CALL_HIERARCHY}'`, () => {
            it(`should show '${CALL_HIERARCHY}' from the menu.`, () => {
                if (!bottomPanel.callHierarchyExists()) {
                    topPanel.toggleCallHierarchyView();
                    bottomPanel.waitForCallHierarchyView();
                }
                expect(bottomPanel.callHierarchyExists()).to.be.true;
            });
        });

    });

    describe('theia top panel', function () {
        it('should set a menu item active when hovered.', () => {
            topPanel.hoverMenuTab(1);
            expect(topPanel.isTabActive(1)).to.be.true;

            topPanel.hoverMenuTab(2);
            expect(topPanel.isTabActive(1)).to.be.false;
            expect(topPanel.isTabActive(2)).to.be.true;
        });

        it('should show menu correctly when clicked on a tab.', () => {
            /* No menu at the start */
            expect(topPanel.subMenuExists()).to.be.false;

            /* Click on the first child */
            topPanel.clickMenuTab(1);
            expect(topPanel.subMenuExists()).to.be.true;

            /* Click again to make the menu disappear */
            topPanel.clickMenuTab(1);
            expect(topPanel.subMenuExists()).to.be.false;

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
            expect(topPanel.subMenuExists()).to.be.false;
        });
    });

});
