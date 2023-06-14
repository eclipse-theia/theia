// *****************************************************************************
// Copyright (C) 2022 EclipseSource and others.
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
import { TheiaApp } from '../theia-app';
import { TheiaToolbar } from '../theia-toolbar';
import test, { page } from './fixtures/theia-fixture';

class TheiaSampleApp extends TheiaApp {
    protected toolbar = new TheiaToolbar(this);

    override async waitForInitialized(): Promise<void> {
        await this.toolbar.show();
    }

    async toggleToolbar(): Promise<void> {
        await this.toolbar.toggle();
    }

    async isToolbarVisible(): Promise<boolean> {
        return this.toolbar.isShown();
    }
}

let app: TheiaSampleApp;

test.describe('Theia Sample Application', () => {

    test('should load', async () => {
        app = await TheiaApp.loadApp(page, TheiaSampleApp);
    });

    test('should start with visible toolbar', async () => {
        expect(await app.isToolbarVisible()).toBe(true);
    });

    test('should toggle toolbar', async () => {
        await app.toggleToolbar();
        expect(await app.isToolbarVisible()).toBe(false);

        await app.toggleToolbar();
        expect(await app.isToolbarVisible()).toBe(true);

        await app.toggleToolbar();
        expect(await app.isToolbarVisible()).toBe(false);
    });

});
