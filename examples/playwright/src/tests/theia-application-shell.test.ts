// *****************************************************************************
// Copyright (C) 2023 Toro Cloud Pty Ltd and others.
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

import { test } from '@playwright/test';
import * as path from 'path';
import { TheiaApp } from '../theia-app';
import { TheiaAppLoader } from '../theia-app-loader';
import { TheiaExplorerView } from '../theia-explorer-view';
import { TheiaTextEditor } from '../theia-text-editor';
import { TheiaWelcomeView } from '../theia-welcome-view';
import { TheiaWorkspace } from '../theia-workspace';

test.describe('Theia Application Shell', () => {
    test.describe.configure({
        timeout: 120000
    });

    let app: TheiaApp;

    test.beforeAll(async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([path.resolve(__dirname, '../../src/tests/resources/sample-files1')]);
        app = await TheiaAppLoader.load({ playwright, browser }, ws);

        // The welcome view must be closed because the memory leak only occurs when there are
        // no tabs left open.
        const welcomeView = new TheiaWelcomeView(app);

        if (await welcomeView.isTabVisible()) {
            await welcomeView.close();
        }
    });

    test.afterAll(async () => {
        await app.page.close();
    });

    /**
     * The aim of this test is to detect memory leaks when opening and closing editors many times.
     * Remove the skip and run the test, check the logs for any memory leak warnings.
     * It should take less than 2min to run, if it takes longer than that, just increase the timeout.
     */
    test.skip('should open and close a text editor many times', async () => {
        for (let i = 0; i < 200; i++) {
            const explorer = await app.openView(TheiaExplorerView);

            const fileStatNode = await explorer.getFileStatNodeByLabel('sample.txt');
            const contextMenu = await fileStatNode.openContextMenu();
            await contextMenu.clickMenuItem('Open');

            const textEditor = new TheiaTextEditor('sample.txt', app);
            await textEditor.waitForVisible();

            await textEditor.close();
        }
    });
});
