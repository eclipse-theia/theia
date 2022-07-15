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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from '@playwright/test';
import { OSUtil } from '../util';
import { TheiaApp } from '../theia-app';
import { TheiaMenuBar } from '../theia-main-menu';
import test, { page } from './fixtures/theia-fixture';

let menuBar: TheiaMenuBar;

test.describe('Theia Main Menu', () => {

    test.beforeAll(async () => {
        const app = await TheiaApp.load(page);
        menuBar = app.menuBar;
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

    test("should show the menu items 'New File' and 'New Folder'", async () => {
        const mainMenu = await menuBar.openMenu('File');
        const menuItems = await mainMenu.visibleMenuItems();
        expect(menuItems).toContain('New File');
        expect(menuItems).toContain('New Folder');
    });

    test("should return menu item by name 'New File'", async () => {
        const mainMenu = await menuBar.openMenu('File');
        const menuItem = await mainMenu.menuItemByName('New File');
        expect(menuItem).toBeDefined();

        const label = await menuItem?.label();
        expect(label).toBe('New File');

        const shortCut = await menuItem?.shortCut();
        expect(shortCut).toBe(OSUtil.isMacOS ? '⌥ N' : 'Alt+N');

        const hasSubmenu = await menuItem?.hasSubmenu();
        expect(hasSubmenu).toBe(false);
    });

    test('should detect whether menu item has submenu', async () => {
        const mainMenu = await menuBar.openMenu('File');
        const newFileItem = await mainMenu.menuItemByName('New File');
        const settingsItem = await mainMenu.menuItemByName('Preferences');

        expect(await newFileItem?.hasSubmenu()).toBe(false);
        expect(await settingsItem?.hasSubmenu()).toBe(true);
    });

    test('should be able to show menu item in submenu by path', async () => {
        const mainMenu = await menuBar.openMenu('File');
        const openPreferencesItem = await mainMenu.menuItemByNamePath('Preferences', 'Open Settings (UI)');

        const label = await openPreferencesItem?.label();
        expect(label).toBe('Open Settings (UI)');
    });

    test('should close main menu', async () => {
        const mainMenu = await menuBar.openMenu('File');
        await mainMenu.close();
        expect(await mainMenu.isOpen()).toBe(false);
    });

});
