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

import { ExpandableTreeNode } from './tree-expansion';
import { TreeNode, CompositeTreeNode } from './tree';

/**
 * Represents a tree node that is able to be compressed into
 * its parent node depending on its `compressed` state.
 */
export interface CompressibleTreeNode extends ExpandableTreeNode {
    /**
     * Indicates whether the tree node can be compressed into its parent node
     */
    compressible: boolean;
}

export namespace CompressibleTreeNode {
    export function is(node: Object | undefined): node is CompressibleTreeNode {
        return !!node && CompositeTreeNode.is(node) && 'compressible' in node;
    }

    function isCompressibleParent(node?: TreeNode): node is CompositeTreeNode {
        return CompositeTreeNode.is(node) && node.children.length === 1;
    }

    export function isCompressionParent(node?: TreeNode): node is CompositeTreeNode {
        return isCompressibleParent(node) && isCompressionChild(node.children[0]);
    }

    export function isCompressionChild(node: Object | undefined): node is CompressibleTreeNode {
        return is(node) && node.compressible && isCompressibleParent(node.parent);
    }

    export function isCompressionHead(node?: TreeNode): node is CompositeTreeNode {
        return isCompressionParent(node) && !isCompressionChild(node);
    }

    export function isCompressionTail(node?: TreeNode): node is CompressibleTreeNode {
        return isCompressionChild(node) && !isCompressionParent(node);
    }

    export function isCompressionParticipant(node?: TreeNode): node is CompositeTreeNode {
        return isCompressionParent(node) || isCompressionChild(node);
    }

    export function getCompressedItems(node?: TreeNode): TreeNode[] {
        const items = [];
        if (isCompressionHead(node)) {
            let next = node.children[0];
            while (isCompressionChild(next)) {
                items.push(next);
                next = next.children[0];
            }
        }
        return items;
    }

    export function getUncompressedParent(node: TreeNode): CompositeTreeNode | undefined {
        let candidate = node.parent;
        while (isCompressionChild(candidate)) {
            candidate = candidate.parent;
        }
        return candidate;
    }
}
