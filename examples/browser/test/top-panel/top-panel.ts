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

import "webdriverio";

export class TopPanel {

    public constructor(protected readonly driver: WebdriverIO.Client<void>) { }

    exists(): boolean {
        return this.driver.isExisting('div#theia-top-panel');
    }

    openNewTerminal() {
        this.clickMenuTab('File');
        this.clickSubMenu('Open New Terminal');
    }

    openProblemsView() {
        this.clickMenuTab('View');
        this.clickSubMenu('Problems');
    }

    waitForSubMenu(): void {
        this.driver.waitForExist('div.p-Widget.p-Menu.p-MenuBar-menu');
    }

    isSubMenuVisible(): boolean {
        return this.driver.isExisting('div.p-Widget.p-Menu.p-MenuBar-menu');
    }

    clickMenuTab(tab: number | string) {
        if (typeof tab === "string") {
            this.driver.element(`ul.p-MenuBar-content`).click(`div=${tab}`);
        } else {
            this.driver.click(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tab})`);
        }
    }

    clickSubMenu(subMenuItem: string) {
        this.driver.element(`div.p-Widget.p-Menu.p-MenuBar-menu .p-Menu-content`).click(`div=${subMenuItem}`);
    }

    hoverMenuTab(tabNumber: number) {
        this.driver.moveToObject(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tabNumber})`);
    }

    isTabActive(tabNumber: number): boolean {
        return this.driver.isExisting(`ul.p-MenuBar-content > .p-mod-active.p-MenuBar-item:nth-child(${tabNumber}`);
    }

    isMenuActive(): boolean {
        return this.driver.isExisting(`#theia\\:menubar.p-mod-active`);
    }

    getxBarTabPosition(tabNumber: number) {
        return this.driver.getLocation(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tabNumber}`, 'x');
    }

    getxSubMenuPosition(): number {
        return this.driver.getLocation(`div.p-Widget.p-Menu.p-MenuBar-menu`, 'x');
    }
}
