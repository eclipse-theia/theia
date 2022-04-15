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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from '@playwright/test';
import { TheiaApp } from '../theia-app';
import { DOT_FILES_FILTER, TheiaExplorerView } from '../theia-explorer-view';
import { TheiaWorkspace } from '../theia-workspace';
import test, { page } from './fixtures/theia-fixture';

let app: TheiaApp;
let explorer: TheiaExplorerView;

test.describe('Theia Explorer View', () => {

    test.beforeAll(async () => {
        const ws = new TheiaWorkspace(['src/tests/resources/sample-files1']);
        app = await TheiaApp.load(page, ws);
        explorer = await app.openView(TheiaExplorerView);
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

    test('should show one folder named "sampleFolder" and one file named "sample.txt"', async () => {
        await explorer.selectTreeNode('sampleFolder');
        expect(await explorer.isTreeNodeSelected('sampleFolder')).toBe(true);
        const fileStatElements = await explorer.visibleFileStatNodes(DOT_FILES_FILTER);
        expect(fileStatElements.length).toBe(2);

        let file; let folder;
        if (await fileStatElements[0].isFolder()) {
            folder = fileStatElements[0];
            file = fileStatElements[1];
        } else {
            folder = fileStatElements[1];
            file = fileStatElements[0];
        }

        expect(await folder.label()).toBe('sampleFolder');
        expect(await folder.isFile()).toBe(false);
        expect(await folder.isFolder()).toBe(true);
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

    test('should provide file stat nodes that can define whether they are collapsed or not and that can be expanded', async () => {
        const file = await explorer.getFileStatNodeByLabel('sample.txt');
        expect(await file.isCollapsed()).toBe(false);

        const folder = await explorer.getFileStatNodeByLabel('sampleFolder');
        expect(await folder.isCollapsed()).toBe(true);

        await folder.expand();
        expect(await folder.isCollapsed()).toBe(false);
    });

    test('should provide file stat node by path "sampleFolder/sampleFolder1/sampleFolder1-1/sampleFile1-1-1.txt"', async () => {
        const file = await explorer.fileStatNode('sampleFolder/sampleFolder1/sampleFolder1-1/sampleFile1-1-1.txt');
        if (!file) { throw Error('File stat node could not be retrieved by path'); }
        expect(await file.label()).toBe('sampleFile1-1-1.txt');
    });

    test('should open context menu on "sample.txt"', async () => {
        const file = await explorer.getFileStatNodeByLabel('sample.txt');
        const menu = await file.openContextMenu();
        expect(await menu.isOpen()).toBe(true);

        const menuItems = await menu.visibleMenuItems();
        expect(menuItems).toContain('Open');
        expect(menuItems).toContain('Delete');
        expect(menuItems).toContain('Download');

        await menu.close();
        expect(await menu.isOpen()).toBe(false);
    });

    test('should rename "sample.txt"', async () => {
        await explorer.renameNode('sample.txt', 'sample-new.txt');
        expect(await explorer.existsFileNode('sample-new.txt')).toBe(true);
        await explorer.renameNode('sample-new.txt', 'sample.txt');
        expect(await explorer.existsFileNode('sample.txt')).toBe(true);
    });

});
