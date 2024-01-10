// *****************************************************************************
// Copyright (C) 2023 EclipseSource and others.
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
import { TheiaToolbar } from '../theia-toolbar';

let app: TheiaApp;
let toolbar: TheiaToolbar;

test.describe('Theia Toolbar', () => {

    test.beforeAll(async ({ playwright, browser }) => {
        app = await TheiaAppLoader.load({ playwright, browser });
        toolbar = new TheiaToolbar(app);
    });

    test.afterAll(async () => {
        await app.page.close();
    });

    test('should toggle the toolbar and check visibility', async () => {
        // depending on the user settings we have different starting conditions for the toolbar
        const isShownInitially = await toolbar.isShown();
        expect(await toolbar.isShown()).toBe(isShownInitially);
        await toolbar.toggle();
        expect(await toolbar.isShown()).toBe(!isShownInitially);
        await toolbar.hide();
        expect(await toolbar.isShown()).toBe(false);
        await toolbar.show();
        expect(await toolbar.isShown()).toBe(true);
    });

    test('should show the default toolbar tools of the sample Theia application', async () => {
        expect(await toolbar.toolbarItems()).toHaveLength(5);
        expect(await toolbar.toolbarItemIds()).toStrictEqual([
            'textEditor.commands.go.back',
            'textEditor.commands.go.forward',
            'workbench.action.splitEditorRight',
            'theia-sample-toolbar-contribution',
            'workbench.action.showCommands'
        ]);
    });

    test('should trigger the "Command Palette" toolbar tool as expect the command palette to open', async () => {
        const commandPaletteTool = await toolbar.toolBarItem('workbench.action.showCommands');
        expect(commandPaletteTool).toBeDefined;
        expect(await commandPaletteTool!.isEnabled()).toBe(true);

        await commandPaletteTool!.trigger();
        expect(await app.quickCommandPalette.isOpen()).toBe(true);
        await app.quickCommandPalette.hide();
        expect(await app.quickCommandPalette.isOpen()).toBe(false);
    });
});
