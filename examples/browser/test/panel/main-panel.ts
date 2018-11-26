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

/**
 * Set of Main Panel Functions for Testing Purposes
 */
export class MainPanel {

    constructor(protected readonly driver: WebdriverIO.Client<void>) { }

    /**
     * Determine if the main application shell exists.
     * The main application shell represents the entire application and is
     * the main container for Theia as a whole.
     *
     * @returns `true` if the main application shell exists.
     */
    appShellExists(): boolean {
        return this.driver.isExisting('#theia-app-shell');
    }

    /**
     * Wait for the main application shell to exist.
     */
    waitForAppShell(): void {
        this.driver.waitForExist('#theia-app-shell', 3000);
    }

    /**
     * Wait for the application to startup.
     */
    waitForStartup(): void {
        this.driver.waitUntil(() => !this.driver.isExisting('.theia-preload'));
    }

    /**
     * Determine if the main content panel exists.
     *
     * @returns `true` if the main content panel exists.
     */
    mainContentPanelExists(): boolean {
        return this.driver.isExisting('#theia-main-content-panel');
    }

    /**
     * Wait for the main content panel to exist.
     */
    waitForMainContentPanel(): boolean {
        return this.driver.waitForExist('#theia-main-content-panel', 3000);
    }

    /**
     * Determine if the top panel exists.
     *
     * @return `true` if the top panel exists.
     */
    topPanelExists(): boolean {
        return this.driver.isExisting('#theia-top-panel');
    }

    /**
     * Wait for the top panel to exist.
     */
    waitForTopPanel(): boolean {
        return this.driver.waitForExist('#theia-top-panel', 3000);
    }

    /**
     * Determine if the right sidebar exists.
     *
     * @returns `true` if the main sidebar exists.
     */
    rightSidebarExists(): boolean {
        return this.driver.isExisting('div.p-TabBar.theia-app-right');
    }

    /**
     * Wait for the right sidebar to exist.
     */
    waitForRightSidebar(): boolean {
        return this.driver.waitForExist('div.p-TabBar.theia-app-right', 3000);
    }

    /**
     * Determine if the left sidebar exists.
     *
     * @returns `true` if the main sidebar exists.
     */
    leftSidebarExists(): boolean {
        return this.driver.isExisting('div.p-TabBar.theia-app-left');
    }

    /**
     * Wait for the left sidebar to exist.
     */
    waitForLeftSidebar(): boolean {
        return this.driver.waitForExist('div.p-TabBar.theia-app-left', 3000);
    }

    /**
     * Determine if the statusbar exists.
     *
     * @returns `true` if the statusbar exists.
     */
    statusBarExists(): boolean {
        return this.driver.isExisting('div#theia-statusBar');
    }

    /**
     * Wait for the statusbar to exist.
     */
    waitForStatusBar(): boolean {
        return this.driver.waitForExist('div#theia-statusBar', 3000);
    }

    /**
     * Determine if the getting-started view exists.
     *
     * @returns `true` if the getting-started view exists.
     */
    gettingStartedExists(): boolean {
        return this.driver.isExisting('#getting.started.widget');
    }

    /**
     * Wait for the getting-started view to exist.
     */
    waitForGettingStarted(): void {
        this.driver.waitForExist('#getting.started.widget', 3000);
    }

}
