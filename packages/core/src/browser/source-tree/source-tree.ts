/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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
import { MaybePromise } from '../../common/types';
import { TreeImpl, CompositeTreeNode, TreeNode, SelectableTreeNode, ExpandableTreeNode } from '../tree';
import { TreeElement, CompositeTreeElement, TreeSource } from './tree-source';

@injectable()
export class SourceTree extends TreeImpl {

    async resolveChildren(parent: TreeElementNodeParent): Promise<TreeNode[]> {
        const elements = await this.resolveElements(parent);
        const nodes: TreeNode[] = [];
        let index = 0;
        for (const element of elements) {
            if (element.visible !== false) {
                nodes.push(this.toNode(element, index++, parent));
            }
        }
        return nodes;
    }

    protected resolveElements(parent: TreeElementNodeParent): MaybePromise<IterableIterator<TreeElement>> {
        if (TreeSourceNode.is(parent)) {
            return parent.source.getElements();
        }
        return parent.element.getElements();
    }

    protected toNode(element: TreeElement, index: number, parent: TreeElementNodeParent): TreeElementNode {
        const id = element.id ? String(element.id) : (parent.id + ':' + index);
        const name = id;
        const existing = this.getNode(id);
        const updated = existing && <TreeElementNode>Object.assign(existing, { element, parent });
        if (CompositeTreeElement.hasElements(element)) {
            if (updated) {
                return updated;
            }
            return {
                element,
                parent,
                id,
                name,
                selected: false,
                expanded: false,
                children: []
            } as TreeElementNode;
        }
        if (CompositeTreeElementNode.is(updated)) {
            delete updated.expanded;
            delete updated.children;
        }
        if (updated) {
            return updated;
        }
        return {
            element,
            parent,
            id,
            name,
            selected: false
        };
    }

}

export type TreeElementNodeParent = CompositeTreeElementNode | TreeSourceNode;

export interface TreeElementNode extends TreeNode, SelectableTreeNode {
    element: TreeElement
    parent: TreeElementNodeParent
}
export namespace TreeElementNode {
    export function is(node: TreeNode | undefined): node is TreeElementNode {
        return SelectableTreeNode.is(node) && 'element' in node;
    }
}

export interface CompositeTreeElementNode extends TreeElementNode, CompositeTreeNode, ExpandableTreeNode {
    element: CompositeTreeElement
    children: TreeElementNode[]
    parent: TreeElementNodeParent
}
export namespace CompositeTreeElementNode {
    export function is(node: TreeNode | undefined): node is CompositeTreeElementNode {
        return TreeElementNode.is(node) && CompositeTreeNode.is(node) && ExpandableTreeNode.is(node) && !!node.visible;
    }
}

export interface TreeSourceNode extends CompositeTreeNode, SelectableTreeNode {
    visible: false
    children: TreeElementNode[]
    parent: undefined
    source: TreeSource
}
export namespace TreeSourceNode {
    export function is(node: TreeNode | undefined): node is TreeSourceNode {
        return CompositeTreeNode.is(node) && !node.visible && 'source' in node;
    }
    export function to(source: undefined): undefined;
    export function to(source: TreeSource): TreeSourceNode;
    export function to(source: TreeSource | undefined): TreeSourceNode | undefined;
    export function to(source: TreeSource | undefined): TreeSourceNode | undefined {
        if (!source) {
            return source;
        }
        const id = source.id || '__source__';
        return {
            id,
            name: id,
            visible: false,
            children: [],
            source,
            parent: undefined,
            selected: false
        };
    }
}
