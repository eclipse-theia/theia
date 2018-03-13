/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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

    isSubMenuVisible(): boolean {
        return this.driver.isExisting('div.p-Widget.p-Menu.p-MenuBar-menu');
    }

    clickMenuTab(tab: number | string) {
        if (typeof tab === "string") {
            this.driver.element(`ul.p-MenuBar-content`).click(`div\=${tab}`);
        } else {
            this.driver.click(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tab})`);
        }
    }

    clickSubMenu(subMenuItem: string) {
        this.driver.element(`div.p-Widget.p-Menu.p-MenuBar-menu .p-Menu-content`).click(`div\=${subMenuItem}`);
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
