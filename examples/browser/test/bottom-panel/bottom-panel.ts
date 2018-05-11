/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import "webdriverio";

export class BottomPanel {

    constructor(protected readonly driver: WebdriverIO.Client<void>) { }

    doesTabExist(tabName: string): boolean {
        return this.driver.element(`#theia-bottom-content-panel .p-TabBar .p-TabBar-content`).isExisting(`div=${tabName}`);
    }

    isTabActive(tabName: string): boolean {
        const tab = this.driver.element(`#theia-bottom-content-panel .p-TabBar .p-TabBar-content`).element(`div=${tabName}`);
        /* Check if the parent li container has the p-mod-current class which makes it active*/
        return (tab.$(`..`).getAttribute('class').split(' ').indexOf('p-mod-current') > -1);
    }

    openTab(tabName: string) {
        this.driver.element(`#theia-bottom-content-panel .p-TabBar .p-TabBar-content`).click(`div=${tabName}`);
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

    closeCurrentView() {
        this.driver.click('#theia-bottom-content-panel .p-TabBar-tab.p-mod-current .p-TabBar-tabCloseIcon');
    }

}
