// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import { TheiaAppLoader } from '../theia-app-loader';
import { TheiaApp } from '../theia-app';
import { TheiaWorkspace } from '../theia-workspace';

class FastTheiaApp extends TheiaApp {

    override waitForShellAndInitialized(): Promise<void> {
        // Loading the document is sufficient for loader lifecycle tests.
        return Promise.resolve();
    }
}

class FailingNavigationTheiaApp extends FastTheiaApp {

    override isShellVisible(): Promise<boolean> {
        return Promise.reject(new Error('Test navigation failure'));
    }
}

class FailingInitializationWorkspace extends TheiaWorkspace {

    override initialize(): void {
        throw new Error('Test workspace initialization failure');
    }
}

test.describe('TheiaAppLoader browser page lifecycle', () => {
    test.skip(process.env.USE_ELECTRON === 'true', 'These tests cover browser page ownership.');

    test('keeps a loader-created page open after successful loading', async ({ playwright, browser }) => {
        const initialContextCount = browser.contexts().length;
        const app = await TheiaAppLoader.load({ playwright, browser }, undefined, FastTheiaApp);

        try {
            expect(app.page.isClosed()).toBe(false);
            expect(browser.contexts()).toHaveLength(initialContextCount + 1);
        } finally {
            await app.page.close();
            app.workspace.remove();
        }

        expect(browser.contexts()).toHaveLength(initialContextCount);
    });

    test('cleans up loader-created contexts after repeated initialization failures', async ({ playwright, browser }) => {
        const initialContextCount = browser.contexts().length;

        for (let attempt = 0; attempt < 3; attempt++) {
            const workspace = new FailingInitializationWorkspace();
            try {
                await expect(TheiaAppLoader.load({ playwright, browser }, workspace, FastTheiaApp))
                    .rejects.toThrow('Test workspace initialization failure');
                expect(browser.contexts()).toHaveLength(initialContextCount);
            } finally {
                workspace.remove();
            }
        }
    });

    test('cleans up a loader-created context after navigation fails', async ({ playwright, browser }) => {
        const initialContextCount = browser.contexts().length;
        const workspace = new TheiaWorkspace();

        try {
            await expect(TheiaAppLoader.load({ playwright, browser }, workspace, FailingNavigationTheiaApp))
                .rejects.toThrow('Test navigation failure');
            expect(browser.contexts()).toHaveLength(initialContextCount);
        } finally {
            workspace.remove();
        }
    });

    test('uses but does not close a caller-provided page when loading fails', async ({ playwright, browser, page }) => {
        const initialContextCount = browser.contexts().length;
        const workspace = new TheiaWorkspace();

        try {
            await expect(TheiaAppLoader.load({ playwright, browser, page }, workspace, FailingNavigationTheiaApp))
                .rejects.toThrow('Test navigation failure');
            expect(page.isClosed()).toBe(false);
            expect(browser.contexts()).toHaveLength(initialContextCount);
        } finally {
            workspace.remove();
        }
    });
});
