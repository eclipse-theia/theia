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
import { TheiaApp } from '../theia-app';
import { PreferenceIds, TheiaPreferenceView } from '../theia-preference-view';
import { DOT_FILES_FILTER, TheiaExplorerView } from '../theia-explorer-view';
import { TheiaWorkspace } from '../theia-workspace';

test.describe('Theia Explorer View', () => {

    let app: TheiaApp;
    let explorer: TheiaExplorerView;

    test.beforeAll(async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([path.resolve(__dirname, '../../src/tests/resources/sample-files1')]);
        app = await TheiaAppLoader.load({ playwright, browser }, ws);

        if (app.isElectron) {
            // set trash preference to off
            const preferenceView = await app.openPreferences(TheiaPreferenceView);
            await preferenceView.setBooleanPreferenceById(PreferenceIds.Files.EnableTrash, false);
            await preferenceView.close();
        }

        explorer = await app.openView(TheiaExplorerView);
        await explorer.waitForVisibleFileNodes();
    });

    test.afterAll(async () => {
        await app.page.close();
    });

    test('should be visible and active after being opened', async () => {
        expect(await explorer.isTabVisible()).toBe(true);
        expect(await explorer.isDisplayed()).toBe(true);
        expect(await explorer.isActive()).toBe(true);
    });

    test("should be opened at the left and have the title 'Explorer'", async () => {
        expect(await explorer.isInSidePanel()).toBe(true);
        expect(await explorer.side()).toBe('left');
        expect(await explorer.title()).toBe('Explorer');
    });

    test('should be possible to close and reopen it', async () => {
        await explorer.close();
        expect(await explorer.isTabVisible()).toBe(false);

        explorer = await app.openView(TheiaExplorerView);
        expect(await explorer.isTabVisible()).toBe(true);
        expect(await explorer.isDisplayed()).toBe(true);
        expect(await explorer.isActive()).toBe(true);
    });

    test('should show one folder named "sampleFolder", one named "sampleFolderCompact" and one file named "sample.txt"', async () => {
        await explorer.selectTreeNode('sampleFolder');
        expect(await explorer.isTreeNodeSelected('sampleFolder')).toBe(true);
        const fileStatElements = await explorer.visibleFileStatNodes(DOT_FILES_FILTER);
        expect(fileStatElements.length).toBe(3);

        let file; let folder; let compactFolder;
        if (await fileStatElements[0].isFolder()) {
            folder = fileStatElements[0];
            compactFolder = fileStatElements[1];
            file = fileStatElements[2];
        } else {
            folder = fileStatElements[2];
            compactFolder = fileStatElements[1];
            file = fileStatElements[0];
        }

        expect(await folder.label()).toBe('sampleFolder');
        expect(await folder.isFile()).toBe(false);
        expect(await folder.isFolder()).toBe(true);
        expect(await compactFolder.label()).toBe('sampleFolderCompact');
        expect(await compactFolder.isFile()).toBe(false);
        expect(await compactFolder.isFolder()).toBe(true);
        expect(await file.label()).toBe('sample.txt');
        expect(await file.isFolder()).toBe(false);
        expect(await file.isFile()).toBe(true);
    });

    test('should provide file stat node by single path fragment "sample.txt"', async () => {
        const file = await explorer.getFileStatNodeByLabel('sample.txt');
        expect(await file.label()).toBe('sample.txt');
        expect(await file.isFolder()).toBe(false);
        expect(await file.isFile()).toBe(true);
    });

    test('should provide file stat nodes that can define whether they are collapsed or not and that can be expanded and collapsed', async () => {
        const file = await explorer.getFileStatNodeByLabel('sample.txt');
        expect(await file.isCollapsed()).toBe(false);

        const folder = await explorer.getFileStatNodeByLabel('sampleFolder');
        expect(await folder.isCollapsed()).toBe(true);

        await folder.expand();
        expect(await folder.isCollapsed()).toBe(false);

        await folder.collapse();
        expect(await folder.isCollapsed()).toBe(true);
    });

    test('should provide file stat node by path "sampleFolder/sampleFolder1/sampleFolder1-1/sampleFile1-1-1.txt"', async () => {
        const file = await explorer.fileStatNode('sampleFolder/sampleFolder1/sampleFolder1-1/sampleFile1-1-1.txt');
        if (!file) { throw Error('File stat node could not be retrieved by path'); }
        expect(await file.label()).toBe('sampleFile1-1-1.txt');
    });

    test('should be able to check if compact folder "sampleFolderCompact/nestedFolder1/nestedFolder2" exists', async () => {
        const fileStatElements = await explorer.visibleFileStatNodes();
        // default setting `explorer.compactFolders=true` renders folders in a compact form - single child folders will be compressed in a combined tree element
        expect(await explorer.existsDirectoryNode('sampleFolderCompact/nestedFolder1/nestedFolder2', true /* compact */)).toBe(true);
        // the `existsDirectoryNode` function will expand the folder, hence we wait for the file nodes to increase as we expect a txt child file node
        await explorer.waitForFileNodesToIncrease(fileStatElements.length);
    });

    test('should provide file stat node by path of compact folder "sampleFolderCompact/nestedFolder1/nestedFolder2/sampleFile1-1.txt"', async () => {
        const file = await explorer.fileStatNode('sampleFolderCompact/nestedFolder1/nestedFolder2/sampleFile1-1.txt', true /* compact */);
        if (!file) { throw Error('File stat node could not be retrieved by path'); }
        expect(await file.label()).toBe('sampleFile1-1.txt');
    });

    test('should open context menu on "sample.txt"', async () => {
        const file = await explorer.getFileStatNodeByLabel('sample.txt');
        const menu = await file.openContextMenu();
        expect(await menu.isOpen()).toBe(true);

        const menuItems = await menu.visibleMenuItems();
        expect(menuItems).toContain('Open');
        expect(menuItems).toContain('Delete');
        if (!app.isElectron) {
            expect(menuItems).toContain('Download');
        }

        await menu.close();
        expect(await menu.isOpen()).toBe(false);
    });

    test('should rename "sample.txt"', async () => {
        await explorer.renameNode('sample.txt', 'sample-new.txt');
        expect(await explorer.existsFileNode('sample-new.txt')).toBe(true);
        await explorer.renameNode('sample-new.txt', 'sample.txt');
        expect(await explorer.existsFileNode('sample.txt')).toBe(true);
    });

    test('should open context menu on nested folder segment "nestedFolder1"', async () => {
        expect(await explorer.existsDirectoryNode('sampleFolderCompact/nestedFolder1/nestedFolder2', true /* compact */)).toBe(true);
        const folder = await explorer.getFileStatNodeByLabel('sampleFolderCompact/nestedFolder1/nestedFolder2', true /* compact */);
        const menu = await folder.openContextMenuOnSegment('nestedFolder1');
        expect(await menu.isOpen()).toBe(true);

        const menuItems = await menu.visibleMenuItems();
        expect(menuItems).toContain('New File...');
        expect(menuItems).toContain('New Folder...');
        expect(menuItems).toContain('Open in Integrated Terminal');
        expect(menuItems).toContain('Find in Folder...');

        await menu.close();
        expect(await menu.isOpen()).toBe(false);
    });

    test('should rename compact folder "sampleFolderCompact" to "sampleDirectoryCompact', async () => {
        expect(await explorer.existsDirectoryNode('sampleFolderCompact/nestedFolder1/nestedFolder2', true /* compact */)).toBe(true);
        await explorer.renameNode(
            'sampleFolderCompact/nestedFolder1/nestedFolder2', 'sampleDirectoryCompact',
            true /* confirm */, 'sampleFolderCompact' /* nodeSegmentLabel */);
        expect(await explorer.existsDirectoryNode('sampleDirectoryCompact/nestedFolder1/nestedFolder2', true /* compact */)).toBe(true);
    });

    // TODO These tests only seems to fail on Ubuntu - it's not clear why
    test.skip('should delete nested folder "sampleDirectoryCompact/nestedFolder1/nestedFolder2"', async () => {
        const fileStatElements = await explorer.visibleFileStatNodes();
        expect(await explorer.existsDirectoryNode('sampleDirectoryCompact/nestedFolder1/nestedFolder2', true /* compact */)).toBe(true);
        await explorer.deleteNode('sampleDirectoryCompact/nestedFolder1/nestedFolder2', true /* confirm */, 'nestedFolder2' /* nodeSegmentLabel */);
        await explorer.waitForFileNodesToDecrease(fileStatElements.length);
        const updatedFileStatElements = await explorer.visibleFileStatNodes();
        expect(updatedFileStatElements.length).toBe(fileStatElements.length - 1);
    });

    test.skip('should delete compact folder "sampleDirectoryCompact/nestedFolder1"', async () => {
        const fileStatElements = await explorer.visibleFileStatNodes();
        expect(await explorer.existsDirectoryNode('sampleDirectoryCompact/nestedFolder1', true /* compact */)).toBe(true);
        await explorer.deleteNode('sampleDirectoryCompact/nestedFolder1', true /* confirm */, 'sampleDirectoryCompact' /* nodeSegmentLabel */);
        await explorer.waitForFileNodesToDecrease(fileStatElements.length);
        const updatedFileStatElements = await explorer.visibleFileStatNodes();
        expect(updatedFileStatElements.length).toBe(fileStatElements.length - 1);
    });

    test('open "sample.txt" via the context menu', async () => {
        expect(await explorer.existsFileNode('sample.txt')).toBe(true);
        await explorer.clickContextMenuItem('sample.txt', ['Open']);
        const span = await app.page.waitForSelector('span:has-text("content line 2")');
        expect(await span.isVisible()).toBe(true);
    });

});
