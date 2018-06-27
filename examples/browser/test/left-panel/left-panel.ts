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
        return (this.driver.element('#files').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1)
            && this.isPanelVisible();
    }

    isGitContainerVisible(): boolean {
        return (this.driver.element('#theia-gitContainer').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1)
            && this.isPanelVisible();
    }

    protected isPanelVisible(): boolean {
        return (this.driver.element('#theia-left-side-panel').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1);
    }
}
