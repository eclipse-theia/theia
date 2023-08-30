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

import { expect } from '@playwright/test';
import { TheiaAboutDialog } from '../theia-about-dialog';
import { TheiaApp } from '../theia-app';
import { TheiaExplorerView } from '../theia-explorer-view';
import { TheiaNotificationIndicator } from '../theia-notification-indicator';
import { TheiaNotificationOverlay } from '../theia-notification-overlay';
import { TheiaQuickCommandPalette } from '../theia-quick-command-palette';
import test, { page } from './fixtures/theia-fixture';

let app: TheiaApp;
let quickCommand: TheiaQuickCommandPalette;

test.describe('Theia Quick Command', () => {

    test.beforeAll(async () => {
        app = await TheiaApp.load(page);
        quickCommand = app.quickCommandPalette;
    });

    test('should show quick command palette', async () => {
        await quickCommand.open();
        expect(await quickCommand.isOpen()).toBe(true);
        await quickCommand.hide();
        expect(await quickCommand.isOpen()).toBe(false);
        await quickCommand.open();
        expect(await quickCommand.isOpen()).toBe(true);
    });

    test('should trigger \'About\' command after typing', async () => {
        await quickCommand.type('About');
        await quickCommand.trigger('About');
        expect(await quickCommand.isOpen()).toBe(false);
        const aboutDialog = new TheiaAboutDialog(app);
        expect(await aboutDialog.isVisible()).toBe(true);
        await aboutDialog.close();
        expect(await aboutDialog.isVisible()).toBe(false);

        await quickCommand.type('Select All');
        await quickCommand.trigger('Select All');
        expect(await quickCommand.isOpen()).toBe(false);
    });

    test('should trigger \'Toggle Explorer View\' command after typing', async () => {
        await quickCommand.type('Toggle Explorer');
        await quickCommand.trigger('Toggle Explorer View');
        expect(await quickCommand.isOpen()).toBe(false);
        const explorerView = new TheiaExplorerView(app);
        expect(await explorerView.isDisplayed()).toBe(true);
    });

    test('should trigger \'Quick Input: Test Positive Integer\' command by confirming via Enter', async () => {
        await quickCommand.type('Test Positive', true);
        expect(await quickCommand.isOpen()).toBe(true);
        await quickCommand.type('6', true);
        const notificationIndicator = new TheiaNotificationIndicator(app);
        const notification = new TheiaNotificationOverlay(app, notificationIndicator);
        expect(await notification.isEntryVisible('Positive Integer: 6')).toBe(true);
    });

});
