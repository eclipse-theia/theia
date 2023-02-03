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
import { TheiaBrowserAppLoader } from '../theia-app-loader';
import { DOT_FILES_FILTER, TheiaExplorerView } from '../theia-explorer-view';
import { TheiaWorkspace } from '../theia-workspace';

test.describe('Theia Workspace', () => {

    test('should be initialized empty by default', async ({ page }) => {
        const app = await TheiaBrowserAppLoader.load(page);
        const explorer = await app.openView(TheiaExplorerView);
        const fileStatElements = await explorer.visibleFileStatNodes(DOT_FILES_FILTER);
        expect(fileStatElements.length).toBe(0);
    });

    test('should be initialized with the contents of a file location', async ({ page }) => {
        const ws = new TheiaWorkspace(['src/tests/resources/sample-files1']);
        const app = await TheiaBrowserAppLoader.load(page, ws);
        const explorer = await app.openView(TheiaExplorerView);
        // resources/sample-files1 contains two folders and one file
        expect(await explorer.existsDirectoryNode('sampleFolder')).toBe(true);
        expect(await explorer.existsDirectoryNode('sampleFolderCompact')).toBe(true);
        expect(await explorer.existsFileNode('sample.txt')).toBe(true);
    });

    test('should be initialized with the contents of multiple file locations', async ({ page }) => {
        const ws = new TheiaWorkspace(['src/tests/resources/sample-files1', 'src/tests/resources/sample-files2']);
        const app = await TheiaBrowserAppLoader.load(page, ws);
        const explorer = await app.openView(TheiaExplorerView);
        // resources/sample-files1 contains two folders and one file
        expect(await explorer.existsDirectoryNode('sampleFolder')).toBe(true);
        expect(await explorer.existsDirectoryNode('sampleFolderCompact')).toBe(true);
        expect(await explorer.existsFileNode('sample.txt')).toBe(true);
        // resources/sample-files2 contains one file
        expect(await explorer.existsFileNode('another-sample.txt')).toBe(true);
    });

});
