/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { injectable, inject } from "inversify";
import { Tree, ITreeNode } from "@theia/core/lib/browser";
import { OutlineSymbolInformationNode, OutlineViewService } from './outline-view-service';

@injectable()
export class OutlineViewTree extends Tree {

    constructor( @inject(OutlineViewService) protected readonly outlineViewManager: OutlineViewService) {
        super();

        outlineViewManager.onDidChangeOutline(nodes => {
            this.setOutlineTree(nodes);
        });
    }

    protected setOutlineTree(tree: OutlineSymbolInformationNode[]) {
        // update expansionstate and selectionstate
        const nodes = this.setExpansionState(tree);
        this.root = nodes[0];
        this.refresh();
    }

    protected setExpansionState(nodes: ITreeNode[]): ITreeNode[] {
        nodes.forEach(node => {
            const treeNode = this.getNode(node.id);
            if (treeNode && OutlineSymbolInformationNode.is(treeNode) && OutlineSymbolInformationNode.is(node)) {
                node.expanded = treeNode.expanded;
                node.selected = treeNode.selected;
                if (node.children.length) {
                    this.setExpansionState(Array.from(node.children));
                }
            }
        });
        return nodes;
    }

}
