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
import { TreeNode, CompositeTreeNode, SelectableTreeNode, ExpandableTreeNode, TreeImpl } from '@theia/core/lib/browser';

import { CallHierarchyService, CallHierarchyItem, CallHierarchyDirection } from '../callhierarchy-service';

import { Md5 } from 'ts-md5/dist/md5';

@injectable()
export class CallHierarchyTree extends TreeImpl {

    protected _callHierarchyService: CallHierarchyService | undefined;

    set callHierarchyService(callHierarchyService: CallHierarchyService | undefined) {
        this._callHierarchyService = callHierarchyService;
    }

    get callHierarchyService(): CallHierarchyService | undefined {
        return this._callHierarchyService;
    }

    async resolveChildren(parent: CompositeTreeNode): Promise<TreeNode[]> {
        if (!CallHierarchyTree.ItemNode.is(parent)) {
            return [];
        }
        if (!this.callHierarchyService) {
            return [];
        }
        if (parent.resolved) {
            return parent.children.slice();
        }
        const item = parent.item;
        const direction = parent.direction;
        const result = await this.callHierarchyService.resolve({ direction, item, resolve: 1 });
        parent.resolved = true;

        const nextItems = result.calls || [];
        return this.toNodes(nextItems, direction, parent);
    }

    protected toNodes(nextItems: CallHierarchyItem[], direction: CallHierarchyDirection, parent: CallHierarchyTree.ItemNode): TreeNode[] {
        return nextItems.map(nextItem => this.toNode(nextItem, direction, parent));
    }

    protected toNode(nextItem: CallHierarchyItem, direction: CallHierarchyDirection, parent: CompositeTreeNode | undefined): TreeNode {
        return CallHierarchyTree.ItemNode.create(nextItem, direction, parent as TreeNode);
    }
}

export namespace CallHierarchyTree {

    export interface ItemNode extends SelectableTreeNode, ExpandableTreeNode {
        resolved: boolean;
        direction: CallHierarchyDirection;
        item: CallHierarchyItem;
    }
    export namespace ItemNode {
        export function is(node: TreeNode | undefined): node is ItemNode {
            return !!node
                && 'item' in node
                && 'direction' in node;
        }
        export function create(item: CallHierarchyItem, direction: CallHierarchyDirection, parent: TreeNode | undefined): ItemNode {
            const name = item.name;
            const id = createId(item, parent);
            return <ItemNode>{
                id, item, name, parent,
                direction,
                visible: true,
                children: [],
                expanded: false,
                selected: false,
                resolved: false
            };
        }
    }

    export function createId(item: CallHierarchyItem, parent: TreeNode | undefined): string {
        const idPrefix = (parent) ? parent.id + '/' : '';
        const id = idPrefix + Md5.hashStr(JSON.stringify(item));
        return id;
    }
}
