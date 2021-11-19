/********************************************************************************
 * Copyright (C) 2021 ARM and others.
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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ExpandableTreeNode, TreeNode } from '@theia/core/lib/browser';
import { SourceTree, TreeElement, TreeElementNode, TreeElementNodeParent, SOURCE_NODE_ID_PREFIX, SOURCE_NODE_ID_SEPARATOR } from '@theia/core/lib/browser/source-tree';
import { Disposable } from '@theia/core';
import { DebugScope, DebugVariable } from './console/debug-console-items';
import { DebugSessionManager } from './debug-session-manager';

@injectable()
export class DebugVariablesSourceTree extends SourceTree {

    @inject(DebugSessionManager)
    protected readonly debugSessionsManager: DebugSessionManager;

    @postConstruct()
    protected init(): void {
        this.toDispose.push(Disposable.create(() => this.expandedElements.clear()));
        this.toDispose.push(this.debugSessionsManager.onDidStartDebugSession(() => {
            this.firstNodeExpanded = true;
            this.expandedElements.clear();
        }));
    }

    protected readonly expandedElements = new Set<string>();
    protected firstNodeExpanded = true;
    /**
     * Id of the first node of the tree
     */
    protected readonly firstNodeId = `${SOURCE_NODE_ID_PREFIX}${SOURCE_NODE_ID_SEPARATOR}0`;

    async resolveChildren(parent: TreeElementNodeParent): Promise<TreeNode[]> {
        const nodes = await super.resolveChildren(parent);
        nodes.forEach(node => {
            if (!ExpandableTreeNode.is(node)
            || !TreeElementNode.is(node)
            || !this.isDebugScopeOrVariable(node.element)) {
                return;
            }
            const elementId = this.getNodeElementId(node);
            if (this.expandedElements.has(elementId)
                || (this.firstNodeExpanded && node.id === this.firstNodeId)) {
                node.expanded = true;
            }
        });
        return nodes;
    }

    handleExpansion(node: Readonly<ExpandableTreeNode>): void {
        if (!TreeElementNode.is(node) || !this.isDebugScopeOrVariable(node.element)) {
            return;
        }
        const id = this.getNodeElementId(node);
        if (node.expanded) {
            this.expandedElements.add(id);
        } else {
            this.expandedElements.delete(id);
            if (node.id === this.firstNodeId) {
                this.firstNodeExpanded = false;
            }
        }
    }
    protected getNodeElementId(node: Readonly<TreeElementNode>): string {
        /* node.id is a positional identifier (EG: __source__:0:1 identifies the second child of the first child of the root)
         * so if used directly to memorize the expanded node it would expand tree nodes that should be collapsed.
         * Using a combination of the node id and the node element name greately reduces the risks of collisions
         */
        if (this.isDebugScopeOrVariable(node.element)) {
            return node.id + '-' + node.element.name;
        }
        return node.id;
    }

    protected isDebugScopeOrVariable(element: TreeElement): element is (DebugScope | DebugVariable) {
        return element instanceof DebugScope || element instanceof DebugVariable;
    }

}
