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
        return this.driver.element(`.p-TabBar.theia-app-bottom .p-TabBar-content`).isExisting(`div\=${tabName}`);
    }

    isTabActive(tabName: string): boolean {
        const tab = this.driver.element(`.p-TabBar.theia-app-bottom .p-TabBar-content`).element(`div\=${tabName}`);
        /* Check if the parent li container has the p-mod-current class which makes it active*/
        return (tab.$(`..`).getAttribute('class').split(' ').indexOf('p-mod-current') > -1);
    }

    openCloseTab(tabName: string) {
        this.driver.element(`.p-TabBar.theia-app-bottom .p-TabBar-content`).click(`div\=${tabName}`);
    }

    isTerminalVisible(): boolean {
        return this.driver.isExisting('.p-Widget div.terminal.xterm');
    }

    waitForTerminal() {
        this.driver.waitForExist('.p-Widget div.terminal.xterm');
    }

    isProblemsViewVisible(): boolean {
        return this.driver.isExisting('.p-Widget div.theia-marker-container');
    }

    waitForProblemsView() {
        this.driver.waitForExist('.p-Widget div.theia-marker-container');
    }

    closeCurrentView() {
        this.driver.click(`.p-TabBar.theia-app-bottom .p-TabBar-tab.theia-mod-current .p-TabBar-tabCloseIcon`);
    }

}
