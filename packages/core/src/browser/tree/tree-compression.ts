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
import { ExpandableTreeNode } from './tree-expansion';
import { TreeNode, CompositeTreeNode } from './tree';

export class CompressionStack {
    protected items: TreeNode[] = [];

    getItems(): TreeNode[] {
        return this.items;
    }

    addItem(item: TreeNode): void {
        if (this.items.find(i => i.id === item.id)) {
            return;
        }
        this.items.push(item);
    }

    removeItem(item: TreeNode): void {
        this.items = this.items.filter(i => i.id !== item.id);
    }
}

@injectable()
export class TreeCompressionService {

    protected compressedMap = new Map<string, CompressionStack>();

    getItems(node: TreeNode | undefined): TreeNode[] {
        if (node) {
            const compressed = this.compressedMap.get(node.id);
            if (compressed) {
                return compressed.getItems();
            }
        }
        return [];
    }

    addItem(node: TreeNode, item: TreeNode): void {
        let compressed: CompressionStack;
        if (this.compressedMap.has(node.id)) {
            compressed = this.compressedMap.get(node.id)!;
        } else {
            compressed = new CompressionStack();
            this.compressedMap.set(node.id, compressed);
        }
        compressed.addItem(item);
    }

    removeItem(node: TreeNode): void {
        if (!this.remove(node) && CompressibleTreeNode.isCompressed(node)) {
            const uncompressedParent = CompressibleTreeNode.getUncompressedParent(node);
            if (uncompressedParent) {
                const compressed = this.compressedMap.get(uncompressedParent.id);
                if (compressed) {
                    compressed.removeItem(node);
                }
            }
        }
        const { children = [] } = node as CompositeTreeNode;
        for (const item of children) {
            this.removeItem(item);
        }
    }

    protected remove(node: TreeNode): boolean {
        return this.compressedMap.delete(node.id);
    }

    reset(): void {
        this.compressedMap.clear();
    }
}

/**
 * Represents a tree node that is able to be compressed into
 * its parent node depending on its `compressed` state.
 */
export interface CompressibleTreeNode extends ExpandableTreeNode {
    /**
     * Indicates whether the tree node is compressed into its parent node
     */
    compressed: boolean;
}

export namespace CompressibleTreeNode {
    export function is(node: Object | undefined): node is CompressibleTreeNode {
        return !!node && 'compressed' in node;
    }

    export function isCompressed(node: Object | undefined): node is CompressibleTreeNode {
        return is(node) && node.compressed;
    }

    export function hasCompressedItem(node: TreeNode): boolean {
        return CompositeTreeNode.is(node) && node.children.length === 1 && CompressibleTreeNode.isCompressed(node.children[0]);
    }

    export function getUncompressedParent(node: TreeNode): CompositeTreeNode | undefined {
        let parent = node.parent;
        while (isCompressed(parent)) {
            parent = parent.parent;
        }
        return parent;
    }
}
