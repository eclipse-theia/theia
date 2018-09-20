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
import { TreeImpl, CompositeTreeNode, TreeNode, SelectableTreeNode, ExpandableTreeNode } from '@theia/core/lib/browser';
import { ConsoleSession, ConsoleItem, CompositeConsoleItem } from '../console-session';

@injectable()
export class ConsoleContentTree extends TreeImpl {

    async resolveChildren(parent: ConsoleItemNodeParent): Promise<TreeNode[]> {
        const items = await this.resolveItems(parent);
        const nodes: TreeNode[] = [];
        let index = 0;
        for (const item of items) {
            if (!item.empty) {
                nodes.push(this.toNode(item, index++, parent));
            }
        }
        return nodes;
    }

    protected async resolveItems(parent: ConsoleItemNodeParent): Promise<ConsoleItem[]> {
        if (ConsoleSessionNode.is(parent)) {
            return parent.session.items;
        }
        return await parent.item.resolve();
    }

    protected toNode(item: ConsoleItem, index: number, parent: ConsoleItemNodeParent): ConsoleItemNode {
        const id = parent.id + ':' + index;
        const name = id;
        const existing = this.getNode(id);
        const updated = existing && <ConsoleItemNode>Object.assign(existing, { item, parent });
        if (CompositeConsoleItem.hasChildren(item)) {
            if (updated) {
                return updated;
            }
            return {
                item,
                parent,
                id,
                name,
                selected: false,
                expanded: false,
                children: []
            } as CompositeConsoleItemNode;
        }
        if (CompositeConsoleItemNode.is(updated)) {
            delete updated.expanded;
            delete updated.children;
            return updated;
        }
        return {
            item,
            parent,
            id,
            name,
            selected: false
        };
    }

}

export type ConsoleItemNodeParent = CompositeConsoleItemNode | ConsoleSessionNode;

export interface ConsoleItemNode extends TreeNode, SelectableTreeNode {
    item: ConsoleItem
    parent: ConsoleItemNodeParent
}
export namespace ConsoleItemNode {
    export function is(node: TreeNode | undefined): node is ConsoleItemNode {
        return SelectableTreeNode.is(node) && 'item' in node;
    }
}

export interface CompositeConsoleItemNode extends ConsoleItemNode, CompositeTreeNode, ExpandableTreeNode {
    item: CompositeConsoleItem
    children: ConsoleItemNode[]
    parent: ConsoleItemNodeParent
}
export namespace CompositeConsoleItemNode {
    export function is(node: TreeNode | undefined): node is CompositeConsoleItemNode {
        return ConsoleItemNode.is(node) && CompositeTreeNode.is(node) && ExpandableTreeNode.is(node) && !!node.visible;
    }
}

export interface ConsoleSessionNode extends CompositeTreeNode, SelectableTreeNode {
    visible: false
    children: ConsoleItemNode[]
    parent: undefined
    session: ConsoleSession
}
export namespace ConsoleSessionNode {
    export function is(node: TreeNode | undefined): node is ConsoleSessionNode {
        return CompositeTreeNode.is(node) && !node.visible && 'session' in node;
    }
    export function to(session: undefined): undefined;
    export function to(session: ConsoleSession): ConsoleSessionNode;
    export function to(session: ConsoleSession | undefined): ConsoleSessionNode | undefined;
    export function to(session: ConsoleSession | undefined): ConsoleSessionNode | undefined {
        if (!session) {
            return session;
        }
        const { id, name } = session;
        return {
            id,
            name,
            visible: false,
            children: [],
            session,
            parent: undefined,
            selected: false
        };
    }
}
