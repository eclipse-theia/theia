// *****************************************************************************
// Copyright (C) 2019 Ericsson and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { CompositeTreeNode, TreeModelImpl, ExpandableTreeNode, TreeNode } from '@theia/core/lib/browser';

@injectable()
export class OutlineViewTreeModel extends TreeModelImpl {

    /**
     * Handle the expansion of the tree node.
     * - The method is a no-op in order to preserve focus on the editor
     * after attempting to perform a `collapse-all`.
     * @param node the expandable tree node.
     */
    protected override handleExpansion(node: Readonly<ExpandableTreeNode>): void {
        // no-op
    }

    override async collapseAll(raw?: Readonly<CompositeTreeNode>): Promise<boolean> {
        const node = raw || this.getFocusedNode();
        if (CompositeTreeNode.is(node)) {
            return this.expansionService.collapseAll(node);
        }
        return false;
    }

    /**
     * The default behavior of `openNode` calls `doOpenNode` which by default
     * toggles the expansion of the node. Overriding to prevent expansion, but
     * allow for the `onOpenNode` event to still fire on a double-click event.
     */
    override openNode(raw?: TreeNode | undefined): void {
        const node = raw || this.getFocusedNode();
        if (node) {
            this.onOpenNodeEmitter.fire(node);
        }
    }

    expandAll(raw?: TreeNode): void {
        if (CompositeTreeNode.is(raw)) {
            for (const child of raw.children) {
                if (ExpandableTreeNode.is(child)) {
                    this.expandAll(child);
                }
            }
        }
        if (ExpandableTreeNode.is(raw)) {
            this.expandNode(raw);
        }
    }

    areNodesCollapsed(): boolean {
        if (CompositeTreeNode.is(this.root)) {
            for (const child of this.root.children) {
                if (!ExpandableTreeNode.isCollapsed(child)) {
                    return false;
                }
            }
        }
        return true;
    }

}
