/********************************************************************************
 * Copyright (c) 2021 SAP SE or an SAP affiliate company and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable } from 'inversify';
import { CompositeTreeNode, TreeNode, ExpandableTreeNode, SelectableTreeNode, TreeSelection, TreeIterator, TreeModelImpl } from '../tree';
import { CompressibleTreeNode } from './tree-compression';

@injectable()
export class CompressibleTreeModel extends TreeModelImpl {

    protected selectIfAncestorOfSelected(node: Readonly<ExpandableTreeNode>): void {
        if (!node.expanded && [...this.selectedNodes].some(selectedNode => !this.isCompressed(selectedNode) && CompositeTreeNode.isAncestor(node, selectedNode))) {
            if (SelectableTreeNode.isVisible(node)) {
                this.selectNode(node);
            }
        }
    }

    selectNextRow(type: TreeSelection.SelectionType = TreeSelection.SelectionType.DEFAULT): void {
        const node = this.getNextSelectableRow();
        if (node) {
            this.addSelection({ node, type });
        }
    }

    getNextSelectableRow(node: TreeNode = this.selectedNodes[0]): SelectableTreeNode | undefined {
        const iterator = this.createIterator(node);
        return iterator && this.doGetNextRow(iterator);
    }

    protected doGetNextRow(iterator: TreeIterator): SelectableTreeNode | undefined {
        // Skip the first item. // TODO: clean this up, and skip the first item in a different way without loading everything.
        iterator.next();
        let result = iterator.next();
        // While `this.isCompressionParent` - to skip all items in a compressed tree row except the last one (the tail) which represents the entire row
        while (!result.done && (!this.isVisibleSelectableNode(result.value) || this.isCompressionParent(result.value))) {
            result = iterator.next();
        }
        const node = result.value;
        if (SelectableTreeNode.isVisible(node)) {
            return node;
        }
        return undefined;
    }

    selectPrevRow(type: TreeSelection.SelectionType = TreeSelection.SelectionType.DEFAULT): void {
        const node = this.getPrevSelectableRow();
        if (node) {
            this.addSelection({ node, type });
        }
    }

    getPrevSelectableRow(node: TreeNode = this.selectedNodes[0]): SelectableTreeNode | undefined {
        const iterator = this.createBackwardIterator(node);
        return iterator && this.doGetNextRow(iterator);
    }

    protected isCompressed(node: TreeNode): boolean {
        return CompressibleTreeNode.isCompressionChild(node);
    }

    protected isCompressionParent(node: TreeNode): boolean {
        return CompressibleTreeNode.isCompressionParent(node);
    }

}
