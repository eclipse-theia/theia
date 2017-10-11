/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { injectable, inject } from 'inversify';
import { OutlineSymbolInformationNode, OutlineViewService } from './outline-view-service';
import {
    TreeWidget,
    ITreeNode,
    NodeProps,
    ISelectableTreeNode,
    TreeProps,
    ContextMenuRenderer,
    TreeModel,
    IExpandableTreeNode
} from "@theia/core/lib/browser";
import { h } from "@phosphor/virtualdom/lib";
import { Message } from '@phosphor/messaging';

@injectable()
export class OutlineViewWidget extends TreeWidget {

    constructor(
        @inject(TreeProps) protected readonly treeProps: TreeProps,
        @inject(TreeModel) model: TreeModel,
        @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer,
        @inject(OutlineViewService) protected readonly outlineViewManager: OutlineViewService
    ) {
        super(treeProps, model, contextMenuRenderer);

        this.model.onSelectionChanged(node => {
            if (node && OutlineSymbolInformationNode.is(node)) {
                this.outlineViewManager.fireSelect(node);
            }
        });

        this.id = 'outline-view';
        this.title.label = 'Outline';
        this.addClass('theia-outline-view');
    }

    protected onAfterHide(msg: Message) {
        super.onAfterHide(msg);
        this.outlineViewManager.open = false;
    }

    protected onAfterShow(msg: Message) {
        super.onAfterShow(msg);
        this.outlineViewManager.open = true;
    }

    protected onUpdateRequest(msg: Message): void {
        if (!this.model.selectedNode && ISelectableTreeNode.is(this.model.root)) {
            this.model.selectNode(this.model.root);
        }
        super.onUpdateRequest(msg);
    }

    protected decorateCaption(node: ITreeNode, caption: h.Child, props: NodeProps): h.Child {
        if (OutlineSymbolInformationNode.is(node)) {
            const icon = h.span({ className: "symbol-icon " + node.iconClass });
            const theTree = h.div({
                ondblclick: () => {
                    this.outlineViewManager.fireOpen(node);
                }
            }, icon, node.name);
            return node.children.length ? super.decorateExpandableCaption(node, theTree, props) : theTree;
        } else {
            return "";
        }
    }

    protected createExpandableChildProps(child: ITreeNode, parent: IExpandableTreeNode, props: NodeProps): NodeProps {
        if (!props.visible) {
            return props;
        }
        if (OutlineSymbolInformationNode.is(child)) {
            const hasChildren = !!child.children.length;
            const visible = parent.expanded;
            const { width } = this.props.expansionToggleSize;
            const parentVisibility = ITreeNode.isVisible(parent) ? 1 : 0;
            const childExpansion = hasChildren ? 0 : 1;
            const indentMultiplier = parentVisibility + childExpansion;
            const relativeIndentSize = width * indentMultiplier;
            const indentSize = props.indentSize + relativeIndentSize;
            return Object.assign({}, props, { visible, indentSize });
        }
        return super.createExpandableChildProps(child, parent, props);
    }

}
