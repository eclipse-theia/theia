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

import { ElementHandle, expect } from '@playwright/test';

import { TheiaApp } from './theia-app';
import { TheiaContextMenu } from './theia-context-menu';
import { TheiaMenu } from './theia-menu';
import { escapeDoubleQuotes } from './util';

export class TheiaTreeNode {

    labelElementCssClass = '.theia-TreeNodeSegmentGrow';
    nodeSegmentLabelCssClass = '.theia-tree-compressed-label-part';
    expansionToggleCssClass = '.theia-ExpansionToggle';
    collapsedCssClass = '.theia-mod-collapsed';

    constructor(protected elementHandle: ElementHandle<SVGElement | HTMLElement>, protected app: TheiaApp) { }

    async label(): Promise<string | null> {
        const labelNode = await this.elementHandle.$(this.labelElementCssClass);
        if (!labelNode) {
            throw new Error('Cannot read label of ' + this.elementHandle);
        }
        return labelNode.textContent();
    }

    async isCollapsed(): Promise<boolean> {
        return !! await this.elementHandle.$(this.collapsedCssClass);
    }

    async isExpandable(): Promise<boolean> {
        return !! await this.elementHandle.$(this.expansionToggleCssClass);
    }

    async expand(): Promise<void> {
        if (!await this.isCollapsed()) {
            return;
        }
        await this.toggleUntil(`:not(${this.collapsedCssClass})`);
    }

    async collapse(): Promise<void> {
        if (await this.isCollapsed()) {
            return;
        }
        await this.toggleUntil(this.collapsedCssClass);
    }

    /**
     * Clicks the expansion toggle until it matches the given selector.
     *
     * The toggle is located in the tree by the ID of its node: the tree keys its rows by index, so when rows are added or removed above
     * this node, the element handle shows another node. Something else, such as the explorer revealing the active editor,
     * may toggle the node between the check and the click, so the click is repeated if it reverted that change.
     */
    protected async toggleUntil(stateSelector: string): Promise<void> {
        const handle = await this.elementHandle.waitForSelector(this.expansionToggleCssClass);
        const nodeId = await handle.getAttribute('data-node-id');
        if (!nodeId) {
            throw new Error('Cannot read the node ID of the expansion toggle of ' + this.elementHandle);
        }
        const treeId = await this.elementHandle.evaluate(element => element.closest('.theia-Tree')?.id);
        const tree = this.app.page.locator(treeId ? `[id="${escapeDoubleQuotes(treeId)}"]` : 'body');
        const toggleSelector = `${this.expansionToggleCssClass}[data-node-id="${escapeDoubleQuotes(nodeId)}"]`;
        const toggle = tree.locator(toggleSelector);
        const toggled = tree.locator(toggleSelector + stateSelector);
        await expect(async () => {
            if (await toggled.count() === 0) {
                await toggle.click();
            }
            await expect(toggled).toHaveCount(1, { timeout: 5000 });
        }).toPass();
    }

    async openContextMenu(): Promise<TheiaMenu> {
        return TheiaContextMenu.open(this.app, () => this.elementHandle.waitForSelector(this.labelElementCssClass));
    }

    async openContextMenuOnSegment(nodeSegmentLabel: string): Promise<TheiaMenu> {
        const treeNodeLabel = await this.elementHandle.waitForSelector(this.labelElementCssClass);
        const treeNodeLabelSegments = await treeNodeLabel.$$(`span${this.nodeSegmentLabelCssClass}`);
        for (const segmentLabel of treeNodeLabelSegments) {
            if (await segmentLabel.textContent() === nodeSegmentLabel) {
                return TheiaContextMenu.open(this.app, () => Promise.resolve(segmentLabel));
            }
        }
        throw new Error('Could not find tree node segment label "' + nodeSegmentLabel + '"');
    }

}
