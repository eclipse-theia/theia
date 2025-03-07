// *****************************************************************************
// Copyright (C) 2025 Stefan Winkler and others.
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

import { CompositeTreeNode, ExpandableTreeNode, SelectableTreeNode, TreeModelImpl, TreeNode } from '@theia/core/lib/browser';
import { injectable, postConstruct } from '@theia/core/shared/inversify';

/** well-known ID for the root node in our tree */
export const ROOT_NODE_ID = 'treeview-example-root';

/**
 * Interface for the "business model".
 *
 * (Note: this could be more elaborated, using different interfaces for containers and concrete items, but for this demonstration,
 * we keep the model like this...)
 */
export interface Item {
    name: string; // name of the category/container or item
    children?: Item[]; // the directly contained items; only defined for categories/containers
    quantity?: number; // the quantity of items available (to demonstrate decoration, ...); only defined for items
    backOrdered?: boolean; // whether this item was backordered (to demonstrate checkboxes); only defined for items
}

/**
 * Function to map a given item to a tree node
 */
export namespace Item {
    export function toTreeNode(item: Item): ExampleTreeNode | ExampleTreeLeaf {
        if (item.children) {
            return <ExampleTreeNode>{
                id: item.name,
                data: item,
                expanded: false,
                children: [],
                parent: undefined,
                type: 'node',
                selected: false
            };
        } else {
            return <ExampleTreeLeaf>{
                id: item.name,
                data: item,
                parent: undefined,
                type: 'leaf',
                checkboxInfo: {
                    checked: item.backOrdered,
                }
            };
        }
    }
}

/** Interface for an container node (having children), along with a type-checking function */
export interface ExampleTreeNode extends ExpandableTreeNode, SelectableTreeNode {
    data: Item;
    type: 'node';
}
export namespace ExampleTreeNode {
    export function is(candidate: object): candidate is ExampleTreeNode {
        return ExpandableTreeNode.is(candidate) && 'type' in candidate && candidate.type === 'node';
    }
}

/** Interface for a leaf node, along with a type-checking function */
export interface ExampleTreeLeaf extends TreeNode {
    data: Item;
    quantityLabel?: string;
    quantityLabelPromise?: Promise<string>;
    type: 'leaf';
}
export namespace ExampleTreeLeaf {
    export function is(candidate: object): candidate is ExampleTreeLeaf {
        return TreeNode.is(candidate) && 'type' in candidate && candidate.type === 'leaf';
    }
}

/**
 * Example data to initialize the "business model"
 */
const EXAMPLE_DATA: Item[] = [{
    name: 'Fruits',
    children: [
        {
            name: 'Apples',
            children: [
                { name: 'Golden Delicious', quantity: 4 },
                { name: 'Gala', quantity: 3 },
            ]
        },
        {
            name: 'Oranges',
            children: [
                { name: 'Clementine', quantity: 2 },
                { name: 'Navel', quantity: 5 },
            ]
        }
    ]
},
{
    name: 'Vegetables',
    children: [
        { name: 'Carrot', quantity: 10 },
        { name: 'Zucchini', quantity: 6 },
        { name: 'Broccoli', quantity: 8 },
    ]
}
];

/**
 * The Tree Model for the tree.
 *
 * This class contains the bridge between business model and tree model and realizes operations on the data.
 */
@injectable()
export class TreeViewExampleModel extends TreeModelImpl {

    /**
     * Initialize the tree model from the business model
     */
    @postConstruct()
    protected override init(): void {
        super.init();

        // create the root node
        const root: CompositeTreeNode = {
            id: ROOT_NODE_ID,
            parent: undefined,
            children: [],
            visible: false // do not show the root node in the UI
        };

        // populate the direct children
        EXAMPLE_DATA.map(item => Item.toTreeNode(item))
            .forEach(node => CompositeTreeNode.addChild(root, node));

        // set the root node as root of the tree
        // This will also initialize the ID-node-map in the tree, so this should be called
        // after populating the children.
        this.tree.root = root;
    }

    /**
     * This is executed when a tree item's checkbox is checked/unchecked.
     *
     * For this example, the check state is applied to the business model (backOrdered property).
     *
     * @param node the affected node
     * @param checked the new state of the checkbox
     */
    override markAsChecked(node: TreeNode, checked: boolean): void {
        if (ExampleTreeLeaf.is(node)) {
            node.data.backOrdered = checked;
        }
        super.markAsChecked(node, checked);
    }

    /**
     * Logic to add a new child item to the given parent.
     *
     * For simplicity, we use a static/constant child, so we don't have to implement UI to ask the user for the name etc.
     * Note that because of the TreeNode.id initialization to Item.name, this method should only be called once. Otherwise
     * we end up with multiple tree items with the same ID, which is not desirable.
     *
     * So in practice, the id should be calculated in a better way...
     *
     * @param parent the parent of the new item
     */
    public addItem(parent: TreeNode): void {
        if (ExampleTreeNode.is(parent)) {
            const newItem: Item = { name: 'Watermelon', quantity: 4 };
            parent.data.children?.push(newItem);
            // since we have modified the tree structure, we need to refresh the parent node
            this.tree.refresh(parent);
        }
    }

    /**
     * Logic to move an leaf node to a new container node.
     *
     * This is used in the Drag & Drop demonstration code to move a dragged item.
     *
     * @param nodeIdToReparent the node ID of the leaf node to move
     * @param targetNode the new parent of the leaf node
     */
    public reparent(nodeIdToReparent: string, targetNode: ExampleTreeNode): void {
        // resolve the ID to the actual node (using the ID-to-node map of the tree)
        const nodeToReparent = this.tree.getNode(nodeIdToReparent);

        // get the original parent
        const sourceParent = nodeToReparent?.parent;
        if (nodeToReparent && ExampleTreeLeaf.is(nodeToReparent)
            && sourceParent && ExampleTreeNode.is(sourceParent)) {
            // find the nodeToReparent in the sourceParent's children
            const indexInCurrentParent = sourceParent.data.children!.indexOf(nodeToReparent.data);
            if (indexInCurrentParent !== -1) {
                // remove the node from its old location (in the business model)
                sourceParent.data.children?.splice(indexInCurrentParent, 1);
                // add the node to its new location (in the business model)
                targetNode.data.children?.push(nodeToReparent.data);
                // trigger refreshes so that the tree is updated according to the structural changes made
                this.tree.refresh(sourceParent);
                this.tree.refresh(targetNode);
            }
        }
    }
}
