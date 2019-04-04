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

import 'webdriverio';

export class LeftPanel {

    constructor(protected readonly driver: WebdriverIO.Client<void>) { }

    doesTabExist(tabName: string): boolean {
        return this.driver.element('.p-TabBar.theia-app-left .p-TabBar-content').isExisting(`div=${tabName}`);
    }

    isTabActive(tabName: string): boolean {
        const tab = this.driver.element('.p-TabBar.theia-app-left .p-TabBar-content').element(`div=${tabName}`);
        /* Check if the parent li container has the p-mod-current class which makes it active */
        return (tab.$('..').getAttribute('class').split(' ').indexOf('p-mod-current') !== -1);
    }

    openCloseTab(tabName: string) {
        this.driver.element('.p-TabBar.theia-app-left .p-TabBar-content').element(`div=${tabName}`).click('..');
        // Wait for animations to finish
        this.driver.pause(300);
    }

    collapseTab(tabName: string) {
        this.driver.element('.p-TabBar.theia-app-left .p-TabBar-content').rightClick(`div=${tabName}`);
        this.driver.element('.p-Widget.p-Menu .p-Menu-content').click('div=Collapse');
    }

    isFileTreeVisible(): boolean {
        return (this.driver.isExisting('#files') && this.driver.element('#files').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1
            && this.isPanelVisible());
    }

    waitForFilesViewVisible(): void {
        this.driver.waitForVisible('#files');
        // Wait for animations to finish
        this.driver.pause(300);
    }

    /**
     * Click on the first node named `name` in the files view to expand or
     * collapse it.  No check is done to make sure this node actually exists or
     * represents a directory.
     */
    toggleDirectoryInFilesView(name: string) {
        this.waitForFilesViewVisible();
        const files = this.driver.element('#files');
        const element = files.element('div=' + name);
        element.click();
        this.driver.pause(300);
    }

    /**
     * Double click on the first node named `name` in the files view to open
     * it.  Not check is done to make sure this node actually exists or
     * represents a file.
     */
    openFileInFilesView(name: string) {
        this.waitForFilesViewVisible();
        const files = this.driver.element('#files');
        const element = files.element('div=' + name);
        element.doubleClick();
        this.driver.pause(300);
    }

    isScmContainerVisible(): boolean {
        return (this.driver.isExisting('#theia-scmContainer') && this.driver.element('#theia-scmContainer').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1
            && this.isPanelVisible());
    }

    waitForScmViewVisible(): void {
        this.driver.waitForVisible('#theia-scmContainer');
        // Wait for animations to finish
        this.driver.pause(300);
    }

    isExtensionsContainerVisible(): boolean {
        return this.driver.isExisting('#extensions') && (this.driver.element('#extensions').getAttribute('class').split(' ').indexOf('theia-extensions') !== -1);
    }

    waitForExtensionsViewVisible(): void {
        this.driver.waitForVisible('#extensions');
        // Wait for animations to finish
        this.driver.pause(300);
    }

    isGitHistoryContainerVisible(): boolean {
        return (this.driver.isExisting('#git-history') && this.driver.element('#git-history').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1
            && this.isPanelVisible());
    }

    waitForGitHistoryViewVisible(): void {
        this.driver.waitForVisible('#git-history');
        // Wait for animations to finish
        this.driver.pause(300);
    }

    isPluginsViewVisible(): boolean {
        return this.driver.isExisting('.p-Widget div.theia-output') && this.driver.element('#plugins').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1;
    }

    waitForPluginsViewVisible(): void {
        this.driver.waitForVisible('#plugins');
        // Wait for animations to finish
        this.driver.pause(300);
    }

    isSearchViewVisible(): boolean {
        return this.driver.isExisting('#search-in-workspace') && this.driver.element('#search-in-workspace').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1;
    }

    waitForSearchViewVisible(): void {
        this.driver.waitForVisible('#search-in-workspace');
        // Wait for animations to finish
        this.driver.pause(300);
    }

    protected isPanelVisible(): boolean {
        return (this.driver.element('#theia-left-side-panel').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1);
    }
}
