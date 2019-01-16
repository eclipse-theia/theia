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

import * as utils from '../utils';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { MainPage } from '../main-page/main-page';
import { TopPanel } from '../top-panel/top-panel';
import { LeftPanel } from '../left-panel/left-panel';
import { BottomPanel } from '../bottom-panel/bottom-panel';

let mainPage: MainPage;
let topPanel: TopPanel;
let leftPanel: LeftPanel;
let bottomPanel: BottomPanel;

/**
 * Prepare some test files in the workspace.
 */
function prepareWorkspace(): string {
    // Put our stuff in a cpp/ subdirectory, because we share the workspace with other tests...
    const rootDir = path.join(utils.getWorkspaceRoot());
    const cppRootDir = path.join(rootDir, 'cpp');

    fs.mkdirSync(cppRootDir);
    fs.writeFileSync(path.join(cppRootDir, 'src.cpp'), `
#if MACRO == 0
#warning "MACRO IS ZERO"
#elif MACRO == 1
#warning "MACRO IS ONE"
#elif MACRO == 2
#warning "MACRO IS TWO"
#endif

int main() {}
`);

    for (const buildnum of [1, 2]) {
        const buildDir = path.join(cppRootDir, `build${buildnum}`);
        fs.mkdirSync(buildDir);
        fs.writeFileSync(path.join(buildDir, 'compile_commands.json'), `
[{
    "file": "../src.cpp",
    "directory": "${buildDir}",
    "arguments": ["c++", "-c", "-DMACRO=${buildnum}", "../src.cpp"]
]]
`);
    }

    // Write the list of build configs in the workspace preferences.  Hopefully,
    // no other test needs to write preferences...
    const dotTheiaDir = path.join(rootDir, '.theia');
    fs.mkdirSync(dotTheiaDir);
    fs.writeFileSync(path.join(dotTheiaDir, 'settings.json'), `
{
    "cpp.buildConfigurations": [{
        "name": "Build one",
        "directory": "${path.join(cppRootDir, 'build1')}"
    }, {
        "name": "Build two",
        "directory": "${path.join(cppRootDir, 'build2')}"
    }]
}
`);

    return rootDir;
}

/**
 * Return whether clangd is available.
 */
function hasClangd() {
    try {
        const out = cp.execSync('clangd -version', { encoding: 'utf8' });
        // Match 'clangd version' at the start of
        // 'clangd version 8.0.0 (trunk 341484) (llvm/trunk 341481)'.
        return out.indexOf('clangd version') === 0;
    } catch (e) {
        return false;
    }
}

/**
 * Open the build config quick open menu, click on the first config that
 * matches `name`.
 */
function changeBuildConfig(name: string, driver: WebdriverIO.Client<void>) {
    const statusBar = driver.element('#theia-statusBar');
    const statusBarButton = statusBar.element('div.element*=Build Config');
    statusBarButton.click();
    driver.pause(300);

    const entry = driver.element('div.monaco-icon-label*=' + name);
    entry.click();
    driver.pause(300);
}

// skip the cpp tests for the moment since they are broken.
describe.skip('cpp extension', function () {

    before(() => {
        const driver = browser;

        driver.url('/');
        driver.localStorage('DELETE');
        driver.refresh();

        mainPage = new MainPage(driver);
        topPanel = new TopPanel(driver);
        leftPanel = new LeftPanel(driver);
        bottomPanel = new BottomPanel(driver);

        mainPage.waitForStartup();
    });

    it.skip('should be able to change build config', function () {
        if (!hasClangd()) {
            this.skip();
            return;
        }

        // This test doesn't pass on AppVeyor yet.
        if (process.platform === 'win32') {
            this.skip();
            return;
        }

        prepareWorkspace();

        // Open Files and Problems views
        topPanel.toggleFilesView();
        topPanel.openProblemsView();
        bottomPanel.waitForProblemsView();

        // Open our test source file
        leftPanel.toggleDirectoryInFilesView('cpp');
        leftPanel.openFileInFilesView('src.cpp');

        // Confirm the expected diagnostic is there, change build
        // configuration, check that the new diagnostic is there, and so on.
        const problemsView = browser.element('#problems');
        problemsView.waitForExist('div.message*=MACRO IS ZERO');

        changeBuildConfig('Build one', browser);
        problemsView.waitForExist('div.message*=MACRO IS ONE');

        changeBuildConfig('Build two', browser);
        problemsView.waitForExist('div.message*=MACRO IS TWO');

        changeBuildConfig('None', browser);
        problemsView.waitForExist('div.message*=MACRO IS ZERO');
    });
});
