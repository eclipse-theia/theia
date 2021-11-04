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

import { injectable } from '@theia/core/shared/inversify';
import { CompositeTreeNode, ExpandableTreeNode, TreeNode } from '@theia/core/lib/browser';
import { SourceTree, TreeElement, TreeElementNode, TreeElementNodeParent } from '@theia/core/lib/browser/source-tree';
import { Disposable } from '@theia/core';
import { DebugScope, DebugVariable } from './console/debug-console-items';

@injectable()
export class DebugVariablesSourceTree extends SourceTree {

    constructor() {
        super();
        this.toDispose.push(Disposable.create(() => this.expanded.clear()));
    }

    protected readonly expanded = new Set<string>();

    async resolveChildren(parent: TreeElementNodeParent): Promise<TreeNode[]> {
        const nodes = await super.resolveChildren(parent);
        nodes.forEach(node => {
            if (!ExpandableTreeNode.is(node)
            || !TreeElementNode.is(node)
            || !this.isDebugScopeOrVariable(node.element)) {
                return;
            }
            const id = this.getNodeId(node);
            if (this.expanded.has(id) || node.id === '__source__:0') {
                node.expanded = true;
            }
        });
        return nodes;
    }

    async refresh(raw?: CompositeTreeNode): Promise<Readonly<CompositeTreeNode> | undefined> {
        const refreshedNode = await super.refresh(raw);
        this.updateExpanded();
        return refreshedNode;
    }

    handleExpansion(node: Readonly<ExpandableTreeNode>): void {
        if (!TreeElementNode.is(node) || !this.isDebugScopeOrVariable(node.element)) {
            return;
        }
        const id = this.getNodeId(node);
        if (node.expanded) {
            this.expanded.add(id);
        } else {
            this.expanded.delete(id);
        }
    }

    protected updateExpanded(): void {
        if (!CompositeTreeNode.is(this.root)) {
            return;
        }
        const expandableNodes: Array<ExpandableTreeNode> = [];
        for (const n of this.root.children) {
            if (!ExpandableTreeNode.is(n)) {
                continue;
            }
            expandableNodes.push(n);
        }
        if (!expandableNodes.length) {
            return;
        }
        this.expanded.clear();
        while (expandableNodes.length) {
            const n = expandableNodes.pop()!;
            if (n.expanded) {
                if (!TreeElementNode.is(n) || !this.isDebugScopeOrVariable(n.element)) {
                    continue;
                }
                const id = this.getNodeId(n);
                this.expanded.add(id);
                for (const node of n.children) {
                    if (!ExpandableTreeNode.is(node)) {
                        continue;
                    }
                    expandableNodes.push(node);
                }
            }
        }
    }

    protected getNodeId(node: Readonly<TreeElementNode>): string {
        if (!this.isDebugScopeOrVariable(node.element)) {
            return node.id;
        }
        let n = node;
        let id = node.element.name;
        while (n) {
            if (!TreeElementNode.is(n.parent)) {
                return id;
            }
            n = n.parent;
            if (!this.isDebugScopeOrVariable(n.element)) {
                return id;
            }
            id = n.element.name + '|' + id;
        }
        return id;
    }

    protected isDebugScopeOrVariable(element: TreeElement): element is (DebugScope | DebugVariable) {
        return element instanceof DebugScope || element instanceof DebugVariable;
    }

}
