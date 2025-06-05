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
import * as path from 'path';
import { TheiaAppLoader } from '../theia-app-loader';
import { DOT_FILES_FILTER, TheiaExplorerView } from '../theia-explorer-view';
import { TheiaWorkspace } from '../theia-workspace';

test.describe('Theia Workspace', () => {
    let isElectron: boolean;
    test.beforeAll(async ({ playwright, browser }) => {
        isElectron = process.env.USE_ELECTRON === 'true';
    });

    test('should be initialized empty by default', async ({ playwright, browser }) => {
        if (!isElectron) {
            const app = await TheiaAppLoader.load({ playwright, browser });
            const explorer = await app.openView(TheiaExplorerView);
            const fileStatElements = await explorer.visibleFileStatNodes(DOT_FILES_FILTER);
            expect(fileStatElements.length).toBe(0);
            await app.page.close();
        }
    });

    test('should be initialized with the contents of a file location', async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([path.resolve(__dirname, '../../src/tests/resources/sample-files1')]);
        const app = await TheiaAppLoader.load({ playwright, browser }, ws);
        const explorer = await app.openView(TheiaExplorerView);
        // resources/sample-files1 contains two folders and one file
        expect(await explorer.existsDirectoryNode('sampleFolder')).toBe(true);
        expect(await explorer.existsDirectoryNode('sampleFolderCompact')).toBe(true);
        expect(await explorer.existsFileNode('sample.txt')).toBe(true);
        await app.page.close();
    });

    test('should be initialized with the contents of multiple file locations', async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([
            path.resolve(__dirname, '../../src/tests/resources/sample-files1'),
            path.resolve(__dirname, '../../src/tests/resources/sample-files2')]);
        const app = await TheiaAppLoader.load({ playwright, browser }, ws);
        const explorer = await app.openView(TheiaExplorerView);
        // resources/sample-files1 contains two folders and one file
        expect(await explorer.existsDirectoryNode('sampleFolder')).toBe(true);
        expect(await explorer.existsDirectoryNode('sampleFolderCompact')).toBe(true);
        expect(await explorer.existsFileNode('sample.txt')).toBe(true);
        // resources/sample-files2 contains one file
        expect(await explorer.existsFileNode('another-sample.txt')).toBe(true);
        await app.page.close();
    });

    test('open sample.txt via file menu', async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([path.resolve(__dirname, '../../src/tests/resources/sample-files1')]);
        const app = await TheiaAppLoader.load({ playwright, browser }, ws);
        const menuEntry = app.isElectron ? 'Open File...' : 'Open...';

        await (await app.menuBar.openMenu('File')).clickMenuItem(menuEntry);
        const fileDialog = await app.page.waitForSelector('div[class="dialogBlock"]');
        expect(await fileDialog.isVisible()).toBe(true);

        const fileEntry = app.page.getByText('sample.txt');
        await fileEntry.click();
        await app.page.locator('#theia-dialog-shell').getByRole('button', { name: 'Open' }).click();

        const span = await app.page.waitForSelector('span:has-text("content line 2")');
        expect(await span.isVisible()).toBe(true);
        await app.page.close();
    });

});
