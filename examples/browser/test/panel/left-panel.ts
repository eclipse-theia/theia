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
 * Set of Left Panel Functions for Testing Purposes
 */
export class LeftPanel {

    constructor(protected readonly driver: WebdriverIO.Client<void>) { }

    /**
     * Determine if the given tab exists.
     *
     * @param name the tab name.
     * @returns `true` if the given tab exists.
     */
    tabExists(name: string): boolean {
        return this.driver.element('.p-TabBar.theia-app-left .p-TabBar-content').isExisting(`div=${name}`);
    }

    /**
     * Determine if the given tab is active.
     *
     * @param name the tab name.
     * @returns `true` if the given tab is active.
     */
    isTabActive(name: string): boolean {
        const tab = this.driver.element('.p-TabBar.theia-app-left .p-TabBar-content').element(`div=${name}`);
        /* Check if the parent li container has the p-mod-current class which makes it active */
        return (tab.$('..').getAttribute('class').split(' ').indexOf('p-mod-current') !== -1);
    }

    /**
     * Toggle the given tab.
     *
     * @param name the tab name.
     */
    toggleTab(name: string): void {
        this.driver.element('.p-TabBar.theia-app-left .p-TabBar-content').click(`div=${name}`);
        // Wait for animations to finish
        this.driver.pause(500);
    }

    /**
     * Collapse the given tab.
     *
     * @param name the tab name.
     */
    collapseTab(name: string): void {
        this.driver.element('.p-TabBar.theia-app-left .p-TabBar-content').rightClick(`div=${name}`);
        this.driver.element('.p-Widget.p-Menu .p-Menu-content').click('div=Collapse');
    }

    /**
     * Determine if the files view is visible.
     *
     * @returns `true` if the files view is visible.
     */
    isFileViewVisible(): boolean {
        return (this.driver.isExisting('#files') && this.driver.element('#files').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1
            && this.isPanelVisible());
    }

    /**
     * Wait for the files view to be visible.
     */
    waitForFilesView(): void {
        this.driver.waitForVisible('#files', 3000);
    }

    /**
     * Toggle directory in the files view.
     *
     * @param name the directory name.
     */
    toggleDirectoryInFilesView(name: string): void {
        // Click on the first node named `name` in the files view to expand or
        // collapse it.  No check is done to make sure this node actually exists or
        // represents a directory.
        this.waitForFilesView();
        const files = this.driver.element('#files');
        const element = files.element('div=' + name);
        element.click();
        this.driver.pause(300);
    }

    /**
     * Open file in files view.
     *
     * @param name the name of the file.
     */
    openFileInFilesView(name: string): void {
        // Double click on the first node named `name` in the files view to open
        // it.  Not check is done to make sure this node actually exists or
        // represents a file.
        this.waitForFilesView();
        const files = this.driver.element('#files');
        const element = files.element('div=' + name);
        element.doubleClick();
        this.driver.pause(300);
    }

    /**
     * Determine if the git container is visible.
     *
     * @returns `true` if the git container is visible.
     */
    isGitContainerVisible(): boolean {
        return (this.driver.isExisting('#theia-gitContainer') && this.driver.element('#theia-gitContainer').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1
            && this.isPanelVisible());
    }

    /**
     * Wait for the git container to be visible.
     */
    waitForGitContainer(): void {
        this.driver.waitForVisible('#theia-gitContainer', 3000);
    }

    /**
     * Determine if the extensions container is visible.
     *
     * @returns `true` if the extensions container is visible.
     */
    isExtensionsContainerVisible(): boolean {
        return this.driver.isExisting('#extensions') && (this.driver.element('#extensions').getAttribute('class').split(' ').indexOf('theia-extensions') !== -1);
    }

    /**
     * Wait for the extensions view to be visible.
     */
    waitForExtensionsView(): void {
        this.driver.waitForVisible('#extensions', 3000);
    }

    /**
     * Determine if the git history to be visible.
     *
     * @returns `true` if the git history is visible.
     */
    isGitHistoryVisible(): boolean {
        return (this.driver.isExisting('#git-history') && this.driver.element('#git-history').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1
            && this.isPanelVisible());
    }

    /**
     * Wait for the git history to be visible.
     */
    waitForGitHistory(): void {
        this.driver.waitForVisible('#git-history', 3000);
    }

    /**
     * Determine if the plugins view is visible.
     *
     * @returns `true` if the plugins view is visible.
     */
    isPluginsViewVisible(): boolean {
        return this.driver.isExisting('.p-Widget div.theia-output') && this.driver.element('#plugins').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1;
    }

    /**
     * Wait for the plugins view to be visible.
     */
    waitForPluginsView(): void {
        this.driver.waitForVisible('#plugins', 3000);
    }

    /**
     * Determine if the search view is visible.
     *
     * @returns `true` if the search view is visible.
     */
    isSearchViewVisible(): boolean {
        return this.driver.isExisting('#search-in-workspace') && this.driver.element('#search-in-workspace').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1;
    }

    /**
     * Wait for the search view to be visible.
     */
    waitForSearchView(): void {
        this.driver.waitForVisible('#search-in-workspace', 3000);
    }

    /**
     * Determine if the debug view is visible.
     *
     * @returns `true` if the debug view is visible.
     */
    isDebugViewVisible(): boolean {
        return this.driver.isExisting('#debug')
            && this.driver.element('#debug').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1;
    }

    /**
     * Wait for the debug view to exist.
     */
    waitForDebugView(): void {
        this.driver.waitForExist('#debug', 3000);
    }

    /**
     * Determine if the left side panel is visible.
     *
     * @returns `true` if the left side panel is visible.
     */
    protected isPanelVisible(): boolean {
        return (this.driver.element('#theia-left-side-panel').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1);
    }
}
