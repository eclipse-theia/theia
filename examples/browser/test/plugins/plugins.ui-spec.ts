/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

/* tslint:disable:no-unused-expression*/
import { MainPage } from '../main-page/main-page';
import { expect } from 'chai';
import { LeftPanel } from '../left-panel/left-panel';
import { TopPanel } from '../top-panel/top-panel';

let mainPage: MainPage;
let driver: WebdriverIO.Client<void>;
let leftPanel: LeftPanel;
let topPanel: TopPanel;

function callCommandPallet(text: string): void {
    driver.keys('F1');
    driver.waitForVisible(".monaco-inputbox>.wrapper>.input");
    typeAndSelectFirstItem(text);
}

function typeAndSelectFirstItem(text: string) {
    driver.$(".monaco-inputbox>.wrapper>.input").leftClick().keys(text);
    driver.$(".quick-open-tree>.monaco-tree").waitForExist(5000);
    driver.pause(50);
    driver.$(".monaco-inputbox>.wrapper>.input").keys('\uE007');
}

function detectPlugin(pluginName: string) {
    if (!leftPanel.isPluginsViewVisible()) {
        topPanel.openPluginsView();
        leftPanel.waitForPluginsViewVisible();
    }

    driver.waitUntil(() => {
        return driver.isExisting("div=" + pluginName);
    }, 20000);

}

function loadAndCheckPlugin(pluginUrl: string, pluginName: string): void {
    callCommandPallet("Plugin: Deploy Plugin by Id");

    driver.waitForVisible(".monaco-inputbox>.wrapper>.input");

    typeAndSelectFirstItem(pluginUrl);

    detectPlugin(pluginName);

    // driver.pause(100);

    callCommandPallet("Hello World");

    driver.waitForExist(".theia-Notification>.text", 3000);
    expect(driver.$(".theia-Notification>.text").getText()).to.be.eql("Hello World!");
}

describe('theia backend plugins', () => {

    beforeEach(() => {
        const url = '/';
        driver = browser;
        driver.url(url);
        mainPage = new MainPage(driver);
        leftPanel = new LeftPanel(driver);
        topPanel = new TopPanel(driver);
        // Make sure that the application shell is loaded
        mainPage.waitForStartup();
    });

    it('should load and initialize frontend plugin', () => {
        loadAndCheckPlugin('https://github.com/eclipse/che-theia-samples/releases/download/test2/eclipse_che_hello_world_frontend_plugin.theia', '@eclipse-che/hello-world-frontend-plugin');
    });

    it('should load and initialize backend plugin', () => {
        loadAndCheckPlugin('https://github.com/eclipse/che-theia-samples/releases/download/test2/eclipse_che_hello_world_backend_plugin.theia', '@eclipse-che/hello-world-backend-plugin');
    });


});

