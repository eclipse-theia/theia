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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { TheiaApp } from '../theia-app';

import { expect } from '@playwright/test';
import test, { page } from './fixtures/theia-fixture';
import { TheiaPageObject } from '../theia-page-object';

class TheiaSampleToolbar extends TheiaPageObject {
    protected selector = '#main-toolbar';

    async show(): Promise<void> {
        if (!await this.isShown()) {
            await this.toggle();
        }
    }

    async toggle(): Promise<void> {
        const isShown = await this.isShown();
        const viewMenu = await this.app.menuBar.openMenu('View');
        await viewMenu.clickMenuItem('Toggle Toolbar');
        isShown ? await this.waitUntilHidden() : await this.waitUntilShown();
    }

    async waitUntilHidden(): Promise<void> {
        await this.page.waitForSelector(this.selector, { state: 'hidden' });
    }

    async waitUntilShown(): Promise<void> {
        await this.page.waitForSelector(this.selector, { state: 'visible' });
    }

    async isShown(): Promise<boolean> {
        const toolbar = await this.page.$(this.selector);
        return !!toolbar && toolbar.isVisible();
    }
}

class TheiaSampleApp extends TheiaApp {
    protected toolbar = new TheiaSampleToolbar(this);

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
