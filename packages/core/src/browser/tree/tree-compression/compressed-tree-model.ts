// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { injectable, inject } from 'inversify';
import { CompressionToggle, TreeCompressionService } from './tree-compression-service';
import { CompositeTreeNode, TreeNode } from '../tree';
import { TreeModelImpl } from '../tree-model';
import { SelectableTreeNode, TreeSelection } from '../tree-selection';
import { ExpandableTreeNode } from '../tree-expansion';
import { TopDownTreeIterator, TreeIterator } from '../tree-iterator';

export class TopDownCompressedTreeIterator extends TopDownTreeIterator {
    protected override isCollapsed(candidate: TreeNode): boolean {
        return ExpandableTreeNode.isCollapsed(candidate) && !TreeCompressionService.prototype.isCompressionParent(candidate);
    }
}

enum BackOrForward {
    Forward,
    Backward,
}

@injectable()
export class CompressedTreeModel extends TreeModelImpl {
    @inject(CompressionToggle) protected readonly compressionToggle: CompressionToggle;
    @inject(TreeCompressionService) protected readonly compressionService: TreeCompressionService;

    protected selectAdjacentRow(
        direction: BackOrForward,
        type: TreeSelection.SelectionType = TreeSelection.SelectionType.DEFAULT,
        startingPoint: Readonly<TreeNode> | undefined = this.getFocusedNode()
    ): void {
        if (!startingPoint && this.root) {
            this.selectAdjacentRow(BackOrForward.Forward, type, this.root);
        }
        if (this.compressionService.isCompressionParticipant(startingPoint)) {
            const chain = this.compressionService.getCompressionChain(startingPoint);
            startingPoint = (direction === BackOrForward.Backward ? chain?.head() : chain?.tail()) ?? startingPoint;
        }

        const iterator = direction === BackOrForward.Backward ? this.createBackwardIterator(startingPoint) : this.createIterator(startingPoint);

        const test = (candidate: TreeNode): candidate is SelectableTreeNode => SelectableTreeNode.isVisible(candidate)
            && (this.compressionService.isCompressionHead(candidate) || !this.compressionService.isCompressionParticipant(candidate));

        const rowRoot = iterator && this.doGetNextNode(iterator, test);
        const nodes: Array<TreeNode | undefined> = (this.compressionService.getCompressionChain(rowRoot) ?? [rowRoot]).reverse();

        const node = nodes.find(SelectableTreeNode.is);

        if (node) {
            this.addSelection({ node, type });
        }
    }

    selectPrevRow(type?: TreeSelection.SelectionType): void {
        this.selectAdjacentRow(BackOrForward.Backward, type);
    }

    selectNextRow(type?: TreeSelection.SelectionType): void {
        this.selectAdjacentRow(BackOrForward.Forward, type);
    }

    protected override createForwardIteratorForNode(node: TreeNode): TreeIterator {
        return new TopDownCompressedTreeIterator(node, { pruneCollapsed: true });
    }

    protected override selectIfAncestorOfSelected(node: Readonly<ExpandableTreeNode>): void {
        if (!this.compressionToggle.compress) { return super.selectIfAncestorOfSelected(node); }
        const tail = this.compressionService.getCompressionChain(node)?.tail() ?? node;
        if (SelectableTreeNode.is(tail) && !tail.expanded && this.selectedNodes.some(selectedNode => CompositeTreeNode.isAncestor(tail, selectedNode))) {
            this.selectNode(tail);
        }
    }
}
