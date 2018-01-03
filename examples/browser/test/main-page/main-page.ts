/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import "webdriverio";
import { TopPanel } from '../top-panel/top-panel';
import { LeftPanel } from '../left-panel/left-panel';

export class MainPage {

    protected readonly topPanel: TopPanel;
    protected readonly leftPanel: LeftPanel;

    constructor(protected readonly driver: WebdriverIO.Client<void>) {
        this.topPanel = new TopPanel(driver);
        this.leftPanel = new LeftPanel(driver);
    }

    applicationShellExists(): boolean {
        return this.driver.waitForExist('#theia-app-shell');
    }

    mainContentPanelExists(): boolean {
        return this.driver.waitForExist('#theia-main-content-panel');
    }

    theiaTopPanelExists(): boolean {
        return this.driver.waitForExist('#theia-top-panel');
    }

    rightSideBarExists(): boolean {
        return this.driver.waitForExist('div.p-TabBar.theia-app-right');
    }

    leftSideBarExists(): boolean {
        return this.driver.waitForExist('div.p-TabBar.theia-app-left');
    }

    statusBarExists(): boolean {
        return this.driver.waitForExist('div#theia-statusBar');
    }

    closeAll() {
        /* Make sure that all the "docked" layouts are closed */
        while (this.driver.isExisting(`.p-Widget.p-TabBar .p-TabBar-tab.p-mod-closable`)) {
            this.driver.rightClick(`.p-Widget.p-TabBar .p-TabBar-tab.p-mod-closable`);
            this.driver.element(`.p-Widget.p-Menu .p-Menu-content`).click(`div\=Close All`);
        }
    }
}
