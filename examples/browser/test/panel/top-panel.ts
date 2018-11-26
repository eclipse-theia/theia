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
 * Set of Top Panel Functions for Testing Purposes
 */
export class TopPanel {

    public constructor(protected readonly driver: WebdriverIO.Client<void>) { }

    exists(): boolean {
        return this.driver.isExisting('div#theia-top-panel');
    }

    /**
     * Open the call hierarchy view.
     */
    toggleCallHierarchyView(): void {
        this.clickMenuTab('View');
        this.clickSubMenu('Call Hierarchy');
    }

    /**
     * Toggle the extensions view.
     */
    toggleExtensionsView(): void {
        this.clickMenuTab('View');
        this.clickSubMenu('Extensions');
    }

    /**
     * Toggle the files view.
     */
    toggleFilesView(): void {
        this.clickMenuTab('View');
        this.clickSubMenu('Files');
    }

    /**
     * Toggle the git view.
     */
    toggleGitView(): void {
        this.clickMenuTab('View');
        this.clickSubMenu('Git');
    }

    /**
     * Toggle the git history view.
     */
    toggleGitHistoryView(): void {
        this.clickMenuTab('View');
        this.clickSubMenu('Git History');
    }

    /**
     * Toggle the outline view.
     */
    toggleOutlineView(): void {
        this.clickMenuTab('View');
        this.clickSubMenu('Outline');
    }

    /**
     * Toggle the output view.
     */
    toggleOutputView(): void {
        this.clickMenuTab('View');
        this.clickSubMenu('Output');
    }

    /**
     * Toggle the search view.
     */
    toggleSearchView(): void {
        this.clickMenuTab('View');
        this.clickSubMenu('Search');
    }

    /**
     * Toggle the debug view.
     */
    toggleDebugView(): void {
        this.clickMenuTab('View');
        this.clickSubMenu('Debug');
    }

    /**
     * Toggle the debug console.
     */
    toggleDebugConsole(): void {
        this.clickMenuTab('View');
        this.clickSubMenu('Debug Console');
    }

    /**
     * Open the plugins view.
     */
    openPluginsView(): void {
        this.clickMenuTab('View');
        this.clickSubMenu('Plugins');
    }

    /**
     * Open the problems view.
     */
    openProblemsView(): void {
        this.clickMenuTab('View');
        this.clickSubMenu('Problems');
    }

    /**
     * Open a new terminal.
     */
    openNewTerminal(): void {
        this.clickMenuTab('Terminal');
        this.clickSubMenu('New Terminal');
    }

    /**
     * Open getting-started view.
     */
    openGettingStarted(): void {
        this.clickMenuTab('Help');
        this.clickSubMenu('Getting Started');
    }

    /**
     * Wait fot the submenu to exist.
     */
    waitForSubMenuToExist(): void {
        this.driver.waitForExist('div.p-Widget.p-Menu.p-MenuBar-menu');
    }

    /**
     * Determine if the submenu exists.
     *
     * @returns `true` if the submenu exists.
     */
    subMenuExists(): boolean {
        return this.driver.isExisting('div.p-Widget.p-Menu.p-MenuBar-menu');
    }

    /**
     * Click the given menu tab.
     *
     * @param tab the tab name or index.
     */
    clickMenuTab(tab: string | number): void {
        if (typeof tab === 'string') {
            this.driver.element('ul.p-MenuBar-content').click(`div=${tab}`);
        } else {
            this.driver.click(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tab})`);
        }
    }

    /**
     * Click the given submenu.
     *
     * @param item the submenu item.
     */
    clickSubMenu(item: string): void {
        this.driver.element('div.p-Widget.p-Menu.p-MenuBar-menu .p-Menu-content').click(`div=${item}`);
    }

    /**
     * Hover the given tab.
     *
     * @param index the tab index.
     */
    hoverMenuTab(index: number): void {
        this.driver.moveToObject(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${index})`);
    }

    /**
     * Determine if the given tab is active.
     *
     * @param index the tab index.
     * @returns `true` if the given tab is active.
     */
    isTabActive(index: number): boolean {
        return this.driver.isExisting(`ul.p-MenuBar-content > .p-mod-active.p-MenuBar-item:nth-child(${index}`);
    }

    /**
     * Determine if the menu is active.
     *
     * @returns `true` if the menu is active.
     */
    isMenuActive(): boolean {
        return this.driver.isExisting('#theia\\:menubar.p-mod-active');
    }

    /**
     * Get the xBar tab position
     *
     * @param index the tab index.
     * @returns the xBar tab position.
     */
    getxBarTabPosition(index: number): number {
        return this.driver.getLocation(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${index}`, 'x');
    }

    /**
     * Get the xSubMenu position.
     *
     * @returns the xSubMenu position.
     */
    getxSubMenuPosition(): number {
        return this.driver.getLocation('div.p-Widget.p-Menu.p-MenuBar-menu', 'x');
    }

    /**
     * Collapse all side panels.
     */
    collapseAllSidePanels(): void {
        this.clickMenuTab('View');
        this.clickSubMenu('Collapse All Side Panels');
    }

}
