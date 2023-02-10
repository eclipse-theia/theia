// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect, test } from '@playwright/test';
import { TheiaExplorerView } from '../theia-explorer-view';
import { TheiaAboutDialog } from '../theia-about-dialog';
import { TheiaAppLoader } from '../theia-app-loader';
import { TheiaWorkspace } from '../theia-workspace';
import { TheiaApp } from '../theia-app';
import { TheiaMenuBar } from 'src/theia-main-menu';

test.describe.configure({ mode: 'serial' });
test.describe('Theia Electron Application', () => {

    let app: TheiaApp;
    let ws: TheiaWorkspace;
    let menuBar: TheiaMenuBar;

    test.beforeAll(async ({ playwright, browser }) => {
        ws = new TheiaWorkspace(['src/tests/resources/sample-files1']);
        const args = {
            useElectron: {
                electronAppPath: '../electron',
                pluginsPath: '../../plugins'
            },
            playwright: playwright,
            browser: browser

        }
            ;
        app = await TheiaAppLoader.load(args, ws);
        menuBar = app.menuBar;
    });

    test.afterAll(async () => {
        await app.page.close();
    });

    test('should load and show main content panel', async () => {
        expect(await app.isMainContentPanelVisible()).toBe(true);
    });

    test('open about dialog using menu', async () => {
        await (await menuBar.openMenu('Help')).clickMenuItem('About');
        const aboutDialog = new TheiaAboutDialog(app);
        expect(await aboutDialog.isVisible()).toBe(true);
        await aboutDialog.page.getByRole('button', { name: 'OK' }).click();
        expect(await aboutDialog.isVisible()).toBe(false);
    });

    test('open file via file menu and cancel', async () => {
        await (await menuBar.openMenu('File')).clickMenuItem('Open File...');
        const fileDialog = await app.page.waitForSelector('div[class="dialogBlock"]');
        expect(await fileDialog.isVisible()).toBe(true);
        await app.page.getByRole('button', { name: 'Cancel' }).click();
        expect(await fileDialog.isVisible()).toBe(false);
    });

    test('open sample.txt via file menu', async () => {
        const menuEntry = 'Open File...';

        await (await menuBar.openMenu('File')).clickMenuItem(menuEntry);

        const fileDialog = await app.page.waitForSelector('div[class="dialogBlock"]');
        expect(await fileDialog.isVisible()).toBe(true);

        const fileEntry = app.page.getByText('sample.txt');
        await fileEntry.click();
        await app.page.getByRole('button', { name: 'Open' }).click();

        const span = await app.page.waitForSelector('span:has-text("content line 2")');
        expect(await span.isVisible()).toBe(true);
    });

    test('open about dialog using command', async () => {
        const quickCommand = app.quickCommandPalette;
        await quickCommand.open();
        await quickCommand.type('About');
        await quickCommand.trigger('About');
        const aboutDialog = new TheiaAboutDialog(app);
        expect(await aboutDialog.isVisible()).toBe(true);
        await aboutDialog.page.getByRole('button', { name: 'OK' }).click();
        expect(await aboutDialog.isVisible()).toBe(false);
    });

    test('select all using command', async () => {
        const quickCommand = app.quickCommandPalette;
        await quickCommand.type('Select All');
        await quickCommand.trigger('Select All');
        expect(await quickCommand.isOpen()).toBe(false);
    });

    test('toggle explorer view using command', async () => {
        const quickCommand = app.quickCommandPalette;
        await quickCommand.open();
        await quickCommand.type('Toggle Explorer');
        await quickCommand.trigger('Toggle Explorer View');
        const explorerView = new TheiaExplorerView(app);
        expect(await explorerView.isDisplayed()).toBe(true);
        await quickCommand.open();
        await quickCommand.type('Toggle Explorer');
        await quickCommand.trigger('Toggle Explorer View');
        expect(await explorerView.isDisplayed()).toBe(false);
    });

    test('toggle explorer view using menu', async () => {
        await (await menuBar.openMenu('View')).clickMenuItem('Explorer');
        const explorerView = new TheiaExplorerView(app);
        expect(await explorerView.isDisplayed()).toBe(true);
        await (await menuBar.openMenu('View')).clickMenuItem('Explorer');
        expect(await explorerView.isDisplayed()).toBe(false);
    });
});

