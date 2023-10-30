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
import { TheiaNotificationIndicator } from '../theia-notification-indicator';
import { TheiaProblemIndicator } from '../theia-problem-indicator';
import { TheiaStatusBar } from '../theia-status-bar';
import { TheiaToggleBottomIndicator } from '../theia-toggle-bottom-indicator';

test.describe('Theia Status Bar', () => {

    let app: TheiaApp;
    let statusBar: TheiaStatusBar;

    test.beforeAll(async ({ playwright, browser }) => {
        app = await TheiaAppLoader.load({ playwright, browser });
        statusBar = app.statusBar;
    });

    test.afterAll(async () => {
        await app.page.close();
    });

    test('should show status bar', async () => {
        expect(await statusBar.isVisible()).toBe(true);
    });

    test('should contain status bar elements', async () => {
        const problemIndicator = await statusBar.statusIndicator(TheiaProblemIndicator);
        const notificationIndicator = await statusBar.statusIndicator(TheiaNotificationIndicator);
        const toggleBottomIndicator = await statusBar.statusIndicator(TheiaToggleBottomIndicator);
        expect(await problemIndicator.isVisible()).toBe(true);
        expect(await notificationIndicator.isVisible()).toBe(true);
        expect(await toggleBottomIndicator.isVisible()).toBe(true);
    });

});
