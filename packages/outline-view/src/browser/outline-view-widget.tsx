/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import {
    TreeWidget,
    TreeNode,
    NodeProps,
    SelectableTreeNode,
    TreeProps,
    ContextMenuRenderer,
    TreeModel,
    ExpandableTreeNode
} from "@theia/core/lib/browser";
import { Message } from '@phosphor/messaging';
import { Emitter } from '@theia/core';
import { CompositeTreeNode } from '@theia/core/lib/browser';
import * as React from "react";

export interface OutlineSymbolInformationNode extends CompositeTreeNode, SelectableTreeNode, ExpandableTreeNode {
    iconClass: string;
}

export namespace OutlineSymbolInformationNode {
    export function is(node: TreeNode): node is OutlineSymbolInformationNode {
        return !!node && SelectableTreeNode.is(node) && 'iconClass' in node;
    }
}

export type OutlineViewWidgetFactory = () => OutlineViewWidget;
export const OutlineViewWidgetFactory = Symbol('OutlineViewWidgetFactory');

@injectable()
export class OutlineViewWidget extends TreeWidget {

    readonly onDidChangeOpenStateEmitter = new Emitter<boolean>();

    constructor(
        @inject(TreeProps) protected readonly treeProps: TreeProps,
        @inject(TreeModel) model: TreeModel,
        @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer
    ) {
        super(treeProps, model, contextMenuRenderer);

        this.id = 'outline-view';
        this.title.label = 'Outline';
        this.addClass('theia-outline-view');
    }

    public setOutlineTree(roots: OutlineSymbolInformationNode[]) {
        const nodes = this.reconcileTreeState(roots);
        this.model.root = {
            id: 'outline-view-root',
            name: 'Outline Root',
            visible: false,
            children: nodes,
            parent: undefined
        } as CompositeTreeNode;
    }

    protected reconcileTreeState(nodes: TreeNode[]): TreeNode[] {
        nodes.forEach(node => {
            if (OutlineSymbolInformationNode.is(node)) {
                const treeNode = this.model.getNode(node.id);
                if (treeNode && OutlineSymbolInformationNode.is(treeNode)) {
                    node.expanded = treeNode.expanded;
                    node.selected = treeNode.selected;
                }
                this.reconcileTreeState(Array.from(node.children));
            }
        });
        return nodes;
    }

    protected onAfterHide(msg: Message) {
        super.onAfterHide(msg);
        this.onDidChangeOpenStateEmitter.fire(false);
    }

    protected onAfterShow(msg: Message) {
        super.onAfterShow(msg);
        this.onDidChangeOpenStateEmitter.fire(true);
    }

    renderIcon(node: TreeNode, props: NodeProps): React.ReactNode {
        if (OutlineSymbolInformationNode.is(node)) {
            return <div className={"symbol-icon symbol-icon-center " + node.iconClass}></div>;
        }
        // tslint:disable-next-line:no-null-keyword
        return null;
    }

    protected isExpandable(node: TreeNode): node is ExpandableTreeNode {
        return OutlineSymbolInformationNode.is(node) && node.children.length > 0;
    }

}
