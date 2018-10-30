/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

export class BottomPanel {

    constructor(protected readonly driver: WebdriverIO.Client<void>) { }

    doesTabExist(tabName: string): boolean {
        return this.driver.element('#theia-bottom-content-panel .p-TabBar .p-TabBar-content').isExisting(`div=${tabName}`);
    }

    isTabActive(tabName: string): boolean {
        const tab = this.driver.element('#theia-bottom-content-panel .p-TabBar .p-TabBar-content').element(`div=${tabName}`);
        /* Check if the parent li container has the p-mod-current class which makes it active*/
        return (tab.$('..').getAttribute('class').split(' ').indexOf('p-mod-current') > -1);
    }

    openTab(tabName: string) {
        this.driver.element('#theia-bottom-content-panel .p-TabBar .p-TabBar-content').click(`div=${tabName}`);
    }

    isTerminalVisible(): boolean {
        return this.driver.isExisting('.p-Widget div.terminal.xterm');
    }

    waitForTerminal() {
        this.driver.waitForExist('.p-Widget div.terminal.xterm');
        // Wait for animations to finish
        this.driver.pause(300);
    }

    isProblemsViewVisible(): boolean {
        return this.driver.isExisting('.p-Widget div.theia-marker-container');
    }

    waitForProblemsView() {
        this.driver.waitForExist('.p-Widget div.theia-marker-container');
        // Wait for animations to finish
        this.driver.pause(300);
    }

    isCallHierarchyViewVisible(): boolean {
        return this.driver.isExisting('#callhierarchy');
    }

    waitForCallHierarchyView() {
        this.driver.waitForExist('#callhierarchy');
        // Wait for animations to finish
        this.driver.pause(300);
    }

    isOutputViewVisible(): boolean {
        return this.driver.isExisting('.p-Widget div.theia-output');
    }

    waitForOutputView() {
        this.driver.waitForExist('.p-Widget div.theia-output');
        // Wait for animations to finish
        this.driver.pause(300);
    }

    closeCurrentView() {
        this.driver.click('#theia-bottom-content-panel .p-TabBar-tab.p-mod-current .p-TabBar-tabCloseIcon');
    }

}
