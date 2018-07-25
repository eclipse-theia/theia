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

import "webdriverio";

export class LeftPanel {

    constructor(protected readonly driver: WebdriverIO.Client<void>) { }

    doesTabExist(tabName: string): boolean {
        return this.driver.element(`.p-TabBar.theia-app-left .p-TabBar-content`).isExisting(`div\=${tabName}`);
    }

    isTabActive(tabName: string): boolean {
        const tab = this.driver.element(`.p-TabBar.theia-app-left .p-TabBar-content`).element(`div\=${tabName}`);
        /* Check if the parent li container has the p-mod-current class which makes it active */
        return (tab.$(`..`).getAttribute('class').split(' ').indexOf('p-mod-current') !== -1);
    }

    openCloseTab(tabName: string) {
        this.driver.element(`.p-TabBar.theia-app-left .p-TabBar-content`).click(`div\=${tabName}`);
        // Wait for animations to finish
        this.driver.pause(300);
    }

    collapseTab(tabName: string) {
        this.driver.element(`.p-TabBar.theia-app-left .p-TabBar-content`).rightClick(`div\=${tabName}`);
        this.driver.element(`.p-Widget.p-Menu .p-Menu-content`).click(`div\=Collapse`);
    }

    isFileTreeVisible(): boolean {
        return (this.driver.isExisting('#files') && this.driver.element('#files').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1
            && this.isPanelVisible());
    }

    waitForFilesView(): void {
        this.driver.waitForExist('#files');
        // Wait for animations to finish
        this.driver.pause(300);
    }

    isGitContainerVisible(): boolean {
        return (this.driver.isExisting('#theia-gitContainer') && this.driver.element('#theia-gitContainer').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1
            && this.isPanelVisible());
    }

    waitForGitView(): void {
        this.driver.waitForExist('#theia-gitContainer');
        // Wait for animations to finish
        this.driver.pause(300);
    }

    isExtensionsContainerVisible(): boolean {
        return this.driver.isExisting('#extensions') && (this.driver.element('#extensions').getAttribute('class').split(' ').indexOf('theia-extensions') !== -1);
    }

    waitForExtensionsView(): void {
        this.driver.waitForExist('#extensions');
        // Wait for animations to finish
        this.driver.pause(300);
    }

    isGitHistoryContainerVisible(): boolean {
        return (this.driver.isExisting('#git-history') && this.driver.element('#git-history').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1
            && this.isPanelVisible());
    }

    waitForGitHistoryView(): void {
        this.driver.waitForExist('#git-history');
        // Wait for animations to finish
        this.driver.pause(300);
    }

    isPluginsViewVisible(): boolean {
        return this.driver.isExisting('.p-Widget div.theia-output') && this.driver.element('#plugins').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1;
    }

    waitForPluginsView(): void {
        this.driver.waitForExist('#plugins');
        // Wait for animations to finish
        this.driver.pause(300);
    }

    isSearchViewVisible(): boolean {
        return this.driver.isExisting('#search-in-workspace') && this.driver.element('#search-in-workspace').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1;
    }

    waitForSearchView(): void {
        this.driver.waitForExist('#search-in-workspace');
        // Wait for animations to finish
        this.driver.pause(300);
    }

    protected isPanelVisible(): boolean {
        return (this.driver.element('#theia-left-side-panel').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1);
    }
}
