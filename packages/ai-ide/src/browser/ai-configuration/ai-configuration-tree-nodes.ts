// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { nls } from '@theia/core';
import { CompositeTreeNode, TreeNode } from '@theia/core/lib/browser/tree/tree';
import { SelectableTreeNode } from '@theia/core/lib/browser/tree/tree-selection';
import { AiConfigurationCategory, AiConfigurationItemStatus, AiConfigurationTreeItem } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';

/**
 * Top-level node representing a single {@link AiConfigurationCategory}.
 * Carries the `expanded` property (making it an `ExpandableTreeNode`) only when
 * the category is a non-empty collection.
 */
export interface AiConfigurationCategoryNode extends SelectableTreeNode, CompositeTreeNode {
    readonly type: 'category';
    readonly categoryId: string;
    readonly iconClass: string;
    readonly contributed: boolean;
    children: AiConfigurationItemNode[];
    expanded?: boolean;
    selected: boolean;
}
export namespace AiConfigurationCategoryNode {
    export function is(node: TreeNode | undefined): node is AiConfigurationCategoryNode {
        return !!node && (node as AiConfigurationCategoryNode).type === 'category';
    }
}

/** Child node representing one item of a collection category. */
export interface AiConfigurationItemNode extends SelectableTreeNode {
    readonly type: 'item';
    readonly categoryId: string;
    readonly itemId: string;
    readonly iconClass: string;
    /** The item's state, as the tree shows it: a dot next to the label (e.g. an MCP server that is running). */
    readonly status?: AiConfigurationItemStatus;
    selected: boolean;
}
export namespace AiConfigurationItemNode {
    export function is(node: TreeNode | undefined): node is AiConfigurationItemNode {
        return !!node && (node as AiConfigurationItemNode).type === 'item';
    }
}

/** Non-selectable separator introducing the "Contributed by extensions" group. */
export interface AiConfigurationSeparatorNode extends TreeNode {
    readonly type: 'separator';
}
export namespace AiConfigurationSeparatorNode {
    export function is(node: TreeNode | undefined): node is AiConfigurationSeparatorNode {
        return !!node && (node as AiConfigurationSeparatorNode).type === 'separator';
    }
}

export interface AiConfigurationTreeBuildOptions {
    /** Returns the previous expansion state of a category, to preserve it across rebuilds. */
    isExpanded?(categoryId: string): boolean | undefined;
}

/**
 * Builds the (invisible) root of the AI Configuration category tree from the
 * ordered list of categories. Extracted as a pure function so the tree shape
 * (children, separator, expansion) can be tested without a DOM.
 */
export namespace AiConfigurationTree {

    export const ROOT_ID = 'ai-configuration-tree-root';
    export const CONTRIBUTED_SEPARATOR_ID = 'ai-configuration-contributed-separator';

    export function categoryNodeId(categoryId: string): string {
        return `category:${categoryId}`;
    }

    export function itemNodeId(categoryId: string, itemId: string): string {
        return `item:${categoryId}:${itemId}`;
    }

    export function buildRoot(categories: AiConfigurationCategory[], options?: AiConfigurationTreeBuildOptions): CompositeTreeNode {
        const root: CompositeTreeNode = {
            id: ROOT_ID,
            parent: undefined,
            visible: false,
            children: []
        };
        let separatorAdded = false;
        for (const category of categories) {
            if (category.contributed && !separatorAdded) {
                CompositeTreeNode.addChild(root, createSeparatorNode());
                separatorAdded = true;
            }
            const items = category.kind === 'collection' ? (category.renderer.getTreeChildren?.() ?? []) : [];
            const categoryNode = createCategoryNode(category, items, options);
            CompositeTreeNode.addChild(root, categoryNode);
            // A tree node is addressed by its id (selection, navigation, expansion), so two items claiming the
            // same id cannot both be nodes. Keep the first and skip the rest deterministically rather than
            // leaving it to the tree model; the category's overview lists every one of them and flags the
            // clash, which is where the user can see that something needs fixing.
            const usedItemIds = new Set<string>();
            for (const item of items) {
                if (usedItemIds.has(item.id)) {
                    continue;
                }
                usedItemIds.add(item.id);
                CompositeTreeNode.addChild(categoryNode, createItemNode(category, item));
            }
        }
        return root;
    }

    function createCategoryNode(category: AiConfigurationCategory, items: AiConfigurationTreeItem[], options?: AiConfigurationTreeBuildOptions): AiConfigurationCategoryNode {
        const collection = category.kind === 'collection';
        const node: AiConfigurationCategoryNode = {
            type: 'category',
            id: categoryNodeId(category.id),
            categoryId: category.id,
            name: category.label,
            iconClass: category.iconClass,
            contributed: !!category.contributed,
            parent: undefined,
            children: [],
            selected: false
        };
        if (collection && items.length > 0) {
            // Categories start collapsed; a rebuild preserves whatever state the user had.
            node.expanded = options?.isExpanded?.(category.id) ?? false;
        }
        return node;
    }

    function createItemNode(category: AiConfigurationCategory, item: AiConfigurationTreeItem): AiConfigurationItemNode {
        return {
            type: 'item',
            id: itemNodeId(category.id, item.id),
            categoryId: category.id,
            itemId: item.id,
            name: item.label,
            // Every child shows an icon so rows look consistent: a dedicated per-item icon where one exists
            // (e.g. individual agents), otherwise the category's icon as a uniform fallback.
            iconClass: item.iconClass ?? category.iconClass,
            status: item.status,
            parent: undefined,
            selected: false
        };
    }

    function createSeparatorNode(): AiConfigurationSeparatorNode {
        return {
            type: 'separator',
            id: CONTRIBUTED_SEPARATOR_ID,
            name: nls.localize('theia/ai/core/aiConfiguration/contributedByExtensions', 'Contributed by extensions'),
            parent: undefined
        };
    }
}
