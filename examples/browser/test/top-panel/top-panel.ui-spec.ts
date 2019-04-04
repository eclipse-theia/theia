/********************************************************************************
 * Copyright (C) 2017-2018 Ericsson and others.
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
import { TopPanel } from './top-panel';
import { BottomPanel } from '../bottom-panel/bottom-panel';
import { RightPanel } from '../right-panel/right-panel';
import { LeftPanel } from '../left-panel/left-panel';
import { MainPage } from '../main-page/main-page';
let topPanel: TopPanel;
let bottomPanel: BottomPanel;
let rightPanel: RightPanel;
let leftPanel: LeftPanel;
let mainPage: MainPage;

before(() => {
    const driver = browser;
    const url = '/';

    driver.url(url);
    driver.localStorage('DELETE');
    driver.refresh();
    topPanel = new TopPanel(driver);
    bottomPanel = new BottomPanel(driver);
    rightPanel = new RightPanel(driver);
    leftPanel = new LeftPanel(driver);
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

    describe('call hierarchy view UI', () => {
        it('should start with call hierarchy view not visible', () => {
            expect(bottomPanel.isCallHierarchyViewVisible()).to.be.false;
        });
        it('call hierarchy view should toggle-on then toggle-off', () => {
            if (!bottomPanel.isCallHierarchyViewVisible()) {
                topPanel.toggleCallHierarchyView();
                bottomPanel.waitForCallHierarchyView();
            }
            expect(bottomPanel.isCallHierarchyViewVisible()).to.be.true;
            topPanel.toggleCallHierarchyView();
            expect(bottomPanel.isCallHierarchyViewVisible()).to.be.false;
        });
    });

    describe('extensions view UI', () => {
        it('should start with extensions view not visible', () => {
            expect(leftPanel.isExtensionsContainerVisible()).to.be.false;
        });
        it('extensions view should toggle-on then toggle-off', () => {
            if (!leftPanel.isExtensionsContainerVisible()) {
                topPanel.toggleExtensionsView();
                leftPanel.waitForExtensionsViewVisible();
            }
            expect(leftPanel.isExtensionsContainerVisible()).to.be.true;
            topPanel.toggleExtensionsView();
            expect(leftPanel.isExtensionsContainerVisible()).to.be.false;
        });
    });

    describe('files view UI', () => {
        it('should start with files view not visible', () => {
            expect(leftPanel.isFileTreeVisible()).to.be.false;
        });
        it('files view should toggle-on then toggle-off', () => {
            if (!leftPanel.isFileTreeVisible()) {
                topPanel.toggleFilesView();
                leftPanel.waitForFilesViewVisible();
            }
            expect(leftPanel.isFileTreeVisible()).to.be.true;
            topPanel.toggleFilesView();
            expect(leftPanel.isFileTreeVisible()).to.be.false;
        });
    });

    describe('scm view UI', () => {
        // re-enable if/when we reset workbench layout between tests
        // it('should start with scm view not visible', () => {
        //     expect(leftPanel.isScmContainerVisible()).to.be.false;
        // });
        it('scm view should toggle-on then toggle-off', () => {
            if (!leftPanel.isScmContainerVisible()) {
                topPanel.toggleScmView();
                leftPanel.waitForScmViewVisible();
            }
            expect(leftPanel.isScmContainerVisible()).to.be.true;
            topPanel.toggleScmView();
            expect(leftPanel.isScmContainerVisible()).to.be.false;
        });
    });

    describe('git history view UI', () => {
        it('should start with git history view not visible', () => {
            expect(leftPanel.isGitHistoryContainerVisible()).to.be.false;
        });

        // note: skipping since git history view does not toggle ATM
        // see: https://github.com/theia-ide/theia/issues/1727
        it.skip('git history view should toggle-on then toggle-off', () => {
            if (!leftPanel.isGitHistoryContainerVisible()) {
                topPanel.toggleGitHistoryView();
                leftPanel.waitForGitHistoryViewVisible();
            }
            expect(leftPanel.isGitHistoryContainerVisible()).to.be.true;
            topPanel.toggleGitHistoryView();
            expect(leftPanel.isGitHistoryContainerVisible()).to.be.false;
        });
    });

    describe('outline view UI', () => {
        const tabName = 'Outline';
        it('should start with outline view tab already created', () => {
            expect(rightPanel.doesTabExist(tabName)).to.be.true;
        });
        it('should start with outline view not visible', () => {
            expect(rightPanel.isOutlineViewVisible()).to.be.false;
        });
        it('should start with outline view tab not active', () => {
            expect(rightPanel.isTabActive(tabName)).to.be.false;
        });
        it('outline view should toggle-on then toggle-off', () => {
            if (!rightPanel.isOutlineViewVisible()) {
                topPanel.toggleOutlineView();
                rightPanel.waitForOutlineViewVisible();
            }
            expect(rightPanel.isOutlineViewVisible()).to.be.true;

            topPanel.toggleOutlineView();
            expect(rightPanel.isOutlineViewVisible()).to.be.false;
        });
    });

    describe('output view UI', () => {
        it('should start with output view not visible', () => {
            expect(leftPanel.isFileTreeVisible()).to.be.false;
        });
        it('output view should toggle-on then toggle-off', () => {
            if (!bottomPanel.isOutputViewVisible()) {
                topPanel.toggleOutputView();
                bottomPanel.waitForOutputView();
            }
            expect(bottomPanel.isOutputViewVisible()).to.be.true;
            topPanel.toggleOutputView();
            expect(bottomPanel.isOutputViewVisible()).to.be.false;
        });
    });

    describe('plugins view UI', () => {
        it('should start with plugins view not visible', () => {
            expect(leftPanel.isFileTreeVisible()).to.be.false;
        });
        it('plugins view should toggle-on then toggle-off', () => {
            if (!bottomPanel.isOutputViewVisible()) {
                topPanel.toggleOutputView();
                bottomPanel.waitForOutputView();
            }
            expect(bottomPanel.isOutputViewVisible()).to.be.true;
            topPanel.toggleOutputView();
            expect(bottomPanel.isOutputViewVisible()).to.be.false;
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

    describe('search view UI', () => {
        it('should start with search view visible', () => {
            expect(leftPanel.isSearchViewVisible()).to.be.true;
        });
        it('search view should toggle-on then toggle-off', () => {
            if (!leftPanel.isSearchViewVisible()) {
                topPanel.toggleSearchView();
                leftPanel.waitForSearchViewVisible();
            }
            expect(leftPanel.isSearchViewVisible()).to.be.true;
            topPanel.toggleSearchView();
            expect(leftPanel.isSearchViewVisible()).to.be.false;
        });
    });

});
