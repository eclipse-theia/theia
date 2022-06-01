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

import { ElementHandle } from '@playwright/test';
import { TheiaApp } from './theia-app';
import { TheiaDialog } from './theia-dialog';
import { TheiaMenuItem } from './theia-menu-item';
import { TheiaRenameDialog } from './theia-rename-dialog';
import { TheiaTreeNode } from './theia-tree-node';
import { TheiaView } from './theia-view';
import { elementContainsClass, normalizeId, OSUtil, urlEncodePath } from './util';

const TheiaExplorerViewData = {
    tabSelector: '#shell-tab-explorer-view-container',
    viewSelector: '#explorer-view-container--files',
    viewName: 'Explorer'
};

export class TheiaExplorerFileStatNode extends TheiaTreeNode {

    constructor(protected override elementHandle: ElementHandle<SVGElement | HTMLElement>, protected explorerView: TheiaExplorerView) {
        super(elementHandle, explorerView.app);
    }

    async absolutePath(): Promise<string | null> {
        return this.elementHandle.getAttribute('title');
    }

    async isFile(): Promise<boolean> {
        return ! await this.isFolder();
    }

    async isFolder(): Promise<boolean> {
        return elementContainsClass(this.elementHandle, 'theia-DirNode');
    }

    async getMenuItemByNamePath(...names: string[]): Promise<TheiaMenuItem> {
        const contextMenu = await this.openContextMenu();
        const menuItem = await contextMenu.menuItemByNamePath(...names);
        if (!menuItem) { throw Error('MenuItem could not be retrieved by path'); }
        return menuItem;
    }

}

export type TheiaExplorerFileStatNodePredicate = (node: TheiaExplorerFileStatNode) => Promise<boolean>;
export const DOT_FILES_FILTER: TheiaExplorerFileStatNodePredicate = async node => {
    const label = await node.label();
    return label ? !label.startsWith('.') : true;
};

export class TheiaExplorerView extends TheiaView {

    constructor(app: TheiaApp) {
        super(TheiaExplorerViewData, app);
    }

    override async activate(): Promise<void> {
        await super.activate();
        const viewElement = await this.viewElement();
        await viewElement?.waitForSelector('.theia-TreeContainer');
    }

    async refresh(): Promise<void> {
        await this.clickButton('navigator.refresh');
    }

    async collapseAll(): Promise<void> {
        await this.clickButton('navigator.collapse.all');
    }

    protected async clickButton(id: string): Promise<void> {
        await this.activate();
        const viewElement = await this.viewElement();
        await viewElement?.hover();
        const button = await viewElement?.waitForSelector(`#${normalizeId(id)}`);
        await button?.click();
    }

    async visibleFileStatNodes(filterPredicate: TheiaExplorerFileStatNodePredicate = (_ => Promise.resolve(true))): Promise<TheiaExplorerFileStatNode[]> {
        const viewElement = await this.viewElement();
        const handles = await viewElement?.$$('.theia-FileStatNode');
        if (handles) {
            const nodes = handles.map(handle => new TheiaExplorerFileStatNode(handle, this));
            const filteredNodes = [];
            for (const node of nodes) {
                if ((await filterPredicate(node)) === true) {
                    filteredNodes.push(node);
                }
            }
            return filteredNodes;
        }
        return [];
    }

    async getFileStatNodeByLabel(label: string): Promise<TheiaExplorerFileStatNode> {
        const file = await this.fileStatNode(label);
        if (!file) { throw Error('File stat node could not be retrieved by path fragments'); }
        return file;
    }

    async fileStatNode(filePath: string): Promise<TheiaExplorerFileStatNode | undefined> {
        return this.fileStatNodeBySegments(...filePath.split('/'));
    }

    async fileStatNodeBySegments(...pathFragments: string[]): Promise<TheiaExplorerFileStatNode | undefined> {
        await super.activate();
        const viewElement = await this.viewElement();

        let currentTreeNode = undefined;
        let fragmentsSoFar = '';
        for (let index = 0; index < pathFragments.length; index++) {
            const fragment = pathFragments[index];
            fragmentsSoFar += index !== 0 ? '/' : '';
            fragmentsSoFar += fragment;

            const selector = this.treeNodeSelector(fragmentsSoFar);
            const nextTreeNode = await viewElement?.waitForSelector(selector, { state: 'visible' });
            if (!nextTreeNode) {
                throw new Error(`Tree node '${selector}' not found in explorer`);
            }
            currentTreeNode = new TheiaExplorerFileStatNode(nextTreeNode, this);
            if (index < pathFragments.length - 1 && await currentTreeNode.isCollapsed()) {
                await currentTreeNode.expand();
            }
        }

        return currentTreeNode;
    }

    async selectTreeNode(filePath: string): Promise<void> {
        await this.activate();
        const treeNode = await this.page.waitForSelector(this.treeNodeSelector(filePath));
        if (await this.isTreeNodeSelected(filePath)) {
            await treeNode.focus();
        } else {
            await treeNode.click({ modifiers: ['Control'] });
        }
    }

    async isTreeNodeSelected(filePath: string): Promise<boolean> {
        const treeNode = await this.page.waitForSelector(this.treeNodeSelector(filePath));
        return elementContainsClass(treeNode, 'theia-mod-selected');
    }

    protected treeNodeSelector(filePath: string): string {
        return `.theia-FileStatNode:has(#${normalizeId(this.treeNodeId(filePath))})`;
    }

    protected treeNodeId(filePath: string): string {
        const workspacePath = this.app.workspace.path;
        const nodeId = `${workspacePath}:${workspacePath}${OSUtil.fileSeparator}${filePath}`;
        if (OSUtil.isWindows) {
            return urlEncodePath(nodeId);
        }
        return nodeId;
    }

    async clickContextMenuItem(file: string, path: string[]): Promise<void> {
        await this.activate();
        const fileStatNode = await this.fileStatNode(file);
        if (!fileStatNode) { throw Error('File stat node could not be retrieved by path fragments'); }
        const menuItem = await fileStatNode.getMenuItemByNamePath(...path);
        await menuItem.click();
    }

    protected async existsNode(path: string, isDirectory: boolean): Promise<boolean> {
        const fileStatNode = await this.fileStatNode(path);
        if (!fileStatNode) {
            return false;
        }
        if (isDirectory) {
            if (!await fileStatNode.isFolder()) {
                throw Error(`FileStatNode for '${path}' is not a directory!`);
            }
        } else {
            if (!await fileStatNode.isFile()) {
                throw Error(`FileStatNode for '${path}' is not a file!`);
            }
        }
        return true;
    }

    async existsFileNode(path: string): Promise<boolean> {
        return this.existsNode(path, false);
    }

    async existsDirectoryNode(path: string): Promise<boolean> {
        return this.existsNode(path, true);
    }

    async getNumberOfVisibleNodes(): Promise<number> {
        await this.activate();
        await this.refresh();
        const fileStatElements = await this.visibleFileStatNodes(DOT_FILES_FILTER);
        return fileStatElements.length;
    }

    async deleteNode(path: string, confirm = true): Promise<void> {
        await this.activate();
        await this.clickContextMenuItem(path, ['Delete']);

        const confirmDialog = new TheiaDialog(this.app);
        await confirmDialog.waitForVisible();
        confirm ? await confirmDialog.clickMainButton() : await confirmDialog.clickSecondaryButton();
        await confirmDialog.waitForClosed();
    }

    async renameNode(path: string, newName: string, confirm = true): Promise<void> {
        await this.activate();
        await this.clickContextMenuItem(path, ['Rename']);

        const renameDialog = new TheiaRenameDialog(this.app);
        await renameDialog.waitForVisible();
        await renameDialog.enterNewName(newName);
        confirm ? await renameDialog.confirm() : await renameDialog.close();
        await renameDialog.waitForClosed();
        await this.refresh();
    }

}
