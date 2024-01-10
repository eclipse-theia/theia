// *****************************************************************************
// Copyright (C) 2021 SAP SE or an SAP affiliate company and others.
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

import { injectable } from 'inversify';
import { ArrayUtils } from '../../../common/types';
import { TreeNode } from '../tree';
import { ExpandableTreeNode } from '../tree-expansion';

export interface CompressionParent extends ExpandableTreeNode {
    children: [CompressionChild];
}

export interface CompressionChild extends ExpandableTreeNode {
    parent: CompressionParent;
}

export type CompressionParticipant = CompressionChild | CompressionParent;

export interface CompressionHead extends CompressionParent {
    parent: ExpandableTreeNode;
}

export interface CompressionTail extends CompressionChild { }

export const CompressionToggle = Symbol('CompressionToggle');
export interface CompressionToggle {
    compress: boolean;
}

@injectable()
export class TreeCompressionService {
    /**
     * @returns `true` if the node has a single child that is a CompositeTreeNode
     * In that case, the child can be shown in the same row as the parent.
     */
    isCompressionParent(node?: unknown): node is CompressionParent {
        return this.isVisibleExpandableNode(node) && node.children.length === 1 && this.isVisibleExpandableNode(node.children[0]);
    }

    protected isVisibleExpandableNode(node?: unknown): node is ExpandableTreeNode {
        return ExpandableTreeNode.is(node) && TreeNode.isVisible(node);
    }

    /**
     * @returns `true` if the node is a CompositeTreeNode and is its parent's sole child
     * In that case, the node can be shown in the same row as its parent.
     */
    isCompressionChild(node?: TreeNode): node is CompressionChild {
        return this.isCompressionParent(node?.parent);
    }

    /**
     * @returns `true` if the node is a CompositeTreeNode with a sole child, and the same is not true of its parent.
     * In that case, the node will appear as the first member of a compressed row.
     */
    isCompressionHead(node?: unknown): node is CompressionHead {
        return this.isCompressionParent(node) && !this.isCompressionParent(node.parent);
    }

    /**
     * @returns `true` if the node's parent is a CompositeTreeNode with a sole child, and the same is not true of the node.
     * In that case, the node will appear as the last member of a compressed row.
     */
    isCompressionTail(node?: TreeNode): node is CompressionTail {
        return this.isCompressionChild(node) && !this.isCompressionParent(node);
    }

    /**
     * @returns `true` if the node is part of a compression row, either a {@link CompressionChild} or {@link CompressionParent}
     */
    isCompressionParticipant(node?: TreeNode): node is CompressionParticipant {
        return this.isCompressionParent(node) || this.isCompressionChild(node);
    }

    /**
     * @returns a sequence of compressed items for the node if it is a {@link CompressionHead}.
     */
    getCompressedChildren(node?: CompressionHead): ArrayUtils.Tail<CompressionChild>;
    getCompressedChildren(node: unknown): ArrayUtils.Tail<CompressionChild> | undefined {
        if (this.isCompressionHead(node)) {
            const items = [];
            let next: TreeNode = node.children[0];
            while (this.isCompressionChild(next)) {
                items.push(next);
                next = next.children[0];
            }
            return ArrayUtils.asTail(items);
        }
    }

    /**
     * @returns The {@link CompressionHead} of the node's compression chain, or undefined if the node is not a {@link CompressionParticipant}.
     */
    getCompressionHead(node?: TreeNode): CompressionHead | undefined {
        while (this.isCompressionParticipant(node)) {
            if (this.isCompressionHead(node)) {
                return node;
            }
            node = node.parent;
        }
    }

    /**
     * @returns The compression chain of which the `node` is a part, or `undefined` if the `node` is not a {@link CompressionParticipant}
     */
    getCompressionChain(node?: TreeNode): ArrayUtils.HeadAndTail<CompressionParticipant> | undefined {
        const head = this.getCompressionHead(node);
        if (head) {
            return ArrayUtils.asHeadAndTail([head as CompressionParticipant].concat(this.getCompressedChildren(head)));
        }
    }
}
