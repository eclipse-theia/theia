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
import { ExpandableTreeNode, TreeNode } from '@theia/core/lib/browser';
import { SourceTree, TreeElementNode, TreeElementNodeParent } from '@theia/core/lib/browser/source-tree';
import { Disposable } from '@theia/core';
import { DebugScope, DebugVariable } from './console/debug-console-items';

@injectable()
export class DebugVariablesSourceTree extends SourceTree {

    protected readonly ttl = 5 * 60 * 1000;

    constructor() {
        super();
        this.toDispose.push(Disposable.create(() => this.expanded.clear()));

        setInterval(() => {
            this.expanded.forEach((value, key) => {
                if (Date.now() > value + this.ttl) {
                    this.expanded.delete(key);
                }
            });
        }, 1000);
    }

    private readonly expanded = new Map<string, number>();

    async resolveChildren(parent: TreeElementNodeParent): Promise<TreeNode[]> {
        const nodes = await super.resolveChildren(parent);
        nodes.forEach(node => {
            if (!TreeElementNode.is(node)
                || !ExpandableTreeNode.is(node)
                || !(node.element instanceof DebugScope
                || node.element instanceof DebugVariable)) {
                return;
            }
            const name = node.element.name;
            if (this.expanded.has(name)) {
                Object.assign(node, { expanded: true });
                this.expanded.set(name, Date.now());
            }
        });
        return nodes;
    }

    handleExpansion(node: Readonly<ExpandableTreeNode>): void {
        if (!TreeElementNode.is(node)
            || !ExpandableTreeNode.is(node)
            || !(node.element instanceof DebugScope
            || node.element instanceof DebugVariable)) {
            return;
        }
        const name = node.element.name;
        if (node.expanded) {
            this.expanded.set(name, Date.now());
        } else {
            this.expanded.delete(name);
        }
    }

}
