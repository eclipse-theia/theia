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

import 'webdriverio';
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

    waitForStartup(): void {
        this.driver.waitUntil(() => !this.driver.isExisting('.theia-preload'));
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
        while (this.driver.isExisting('.p-Widget.p-TabBar .p-TabBar-tab.p-mod-closable')) {
            this.driver.rightClick('.p-Widget.p-TabBar .p-TabBar-tab.p-mod-closable');
            this.driver.element('.p-Widget.p-Menu .p-Menu-content').click('div=Close All');
        }
    }
}
