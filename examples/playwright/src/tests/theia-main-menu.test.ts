// *****************************************************************************
// Copyright (C) 2021 logi.cals GmbH, EclipseSource and others.
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
import { TheiaApp } from '../theia-app';
import { TheiaAppLoader } from '../theia-app-loader';
import { TheiaAboutDialog } from '../theia-about-dialog';
import { TheiaMenuBar } from '../theia-main-menu';
import { OSUtil } from '../util';
import { TheiaExplorerView } from '../theia-explorer-view';

test.describe('Theia Main Menu', () => {

    let app: TheiaApp;
    let menuBar: TheiaMenuBar;

    test.beforeAll(async ({ playwright, browser }) => {
        app = await TheiaAppLoader.load({ playwright, browser });
        menuBar = app.menuBar;
    });

    test.afterAll(async () => {
        await app.page.close();
    });

    test('should show the main menu bar', async () => {
        const menuBarItems = await menuBar.visibleMenuBarItems();
        expect(menuBarItems).toContain('File');
        expect(menuBarItems).toContain('Edit');
        expect(menuBarItems).toContain('Help');
    });

    test("should open main menu 'File'", async () => {
        const mainMenu = await menuBar.openMenu('File');
        expect(await mainMenu.isOpen()).toBe(true);
    });

    test("should show the menu items 'New Text File' and 'New Folder'", async () => {
        const mainMenu = await menuBar.openMenu('File');
        const menuItems = await mainMenu.visibleMenuItems();
        expect(menuItems).toContain('New Text File');
        expect(menuItems).toContain('New Folder...');
    });

    test("should return menu item by name 'New Text File'", async () => {
        const mainMenu = await menuBar.openMenu('File');
        const menuItem = await mainMenu.menuItemByName('New Text File');
        expect(menuItem).toBeDefined();

        const label = await menuItem?.label();
        expect(label).toBe('New Text File');

        const shortCut = await menuItem?.shortCut();
        expect(shortCut).toBe(OSUtil.isMacOS ? '⌥ N' : app.isElectron ? 'Ctrl+N' : 'Alt+N');

        const hasSubmenu = await menuItem?.hasSubmenu();
        expect(hasSubmenu).toBe(false);
    });

    test('should detect whether menu item has submenu', async () => {
        const mainMenu = await menuBar.openMenu('File');
        const newFileItem = await mainMenu.menuItemByName('New Text File');
        const settingsItem = await mainMenu.menuItemByName('Preferences');

        expect(await newFileItem?.hasSubmenu()).toBe(false);
        expect(await settingsItem?.hasSubmenu()).toBe(true);
    });

    test('should be able to show menu item in submenu by path', async () => {
        const mainMenu = await menuBar.openMenu('File');
        const openPreferencesItem = await mainMenu.menuItemByNamePath('Preferences', 'Settings');

        const label = await openPreferencesItem?.label();
        expect(label).toBe('Settings');
    });

    test('should close main menu', async () => {
        const mainMenu = await menuBar.openMenu('File');
        await mainMenu.close();
        expect(await mainMenu.isOpen()).toBe(false);
    });

    test('open about dialog using menu', async () => {
        await (await menuBar.openMenu('Help')).clickMenuItem('About');
        const aboutDialog = new TheiaAboutDialog(app);
        expect(await aboutDialog.isVisible()).toBe(true);
        await aboutDialog.page.locator('#theia-dialog-shell').getByRole('button', { name: 'OK' }).click();
        expect(await aboutDialog.isVisible()).toBe(false);
    });

    test('open file via file menu and cancel', async () => {
        const openFileEntry = app.isElectron ? 'Open File...' : 'Open...';
        await (await menuBar.openMenu('File')).clickMenuItem(openFileEntry);
        const fileDialog = await app.page.waitForSelector('div[class="dialogBlock"]');
        expect(await fileDialog.isVisible()).toBe(true);
        await app.page.locator('#theia-dialog-shell').getByRole('button', { name: 'Cancel' }).click();
        expect(await fileDialog.isVisible()).toBe(false);
    });

    test('Create file via New File menu and cancel', async () => {
        const openFileEntry = 'New File...';
        await (await menuBar.openMenu('File')).clickMenuItem(openFileEntry);
        const quickPick = app.page.getByPlaceholder('Select File Type or Enter');
        // type file name and press enter
        await quickPick.fill('test.txt');
        await quickPick.press('Enter');

        // check file dialog is opened and accept with "Create File" button
        const fileDialog = await app.page.waitForSelector('div[class="dialogBlock"]');
        expect(await fileDialog.isVisible()).toBe(true);
        await app.page.locator('#theia-dialog-shell').getByRole('button', { name: 'Create File' }).click();
        expect(await fileDialog.isVisible()).toBe(false);

        // check file in workspace exists
        const explorer = await app.openView(TheiaExplorerView);
        await explorer.refresh();
        await explorer.waitForVisibleFileNodes();
        expect(await explorer.existsFileNode('test.txt')).toBe(true);
    });
});
