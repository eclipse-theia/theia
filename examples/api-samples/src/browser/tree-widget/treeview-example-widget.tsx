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

import { Disposable, DisposableCollection, MenuPath, MessageService } from "@theia/core";
import { ContextMenuRenderer, NodeProps, TreeModel, TreeNode, TreeProps, TreeWidget } from "@theia/core/lib/browser";
import { inject, injectable } from "@theia/core/shared/inversify";
import * as React from "@theia/core/shared/react";
import "../../../src/browser/tree-widget/treeview-example-widget.css";
import { ExampleTreeLeaf, ExampleTreeNode, TreeViewExampleModel } from "./treeview-example-model";

/** Well-known constant for the context menu path */
export const TREEVIEW_EXAMPLE_CONTEXT_MENU: MenuPath = ['theia-examples:treeview-example-context-menu'];

/** Implementation of the Tree Widget */
@injectable()
export class TreeViewExampleWidget extends TreeWidget {
    /** The ID of the view */
    static readonly ID = 'theia-examples:treeview-example-view';
    /** The label of the view */
    static readonly LABEL = 'Example Tree View';

    /** Used in Drag & Drop code to remember and cancel deferred expansion of hovered nodes */
    protected readonly toCancelNodeExpansion = new DisposableCollection();

    /** The MessageService to demonstrate the action when a user opens (double-clicks) a node */
    @inject(MessageService) private readonly messageService: MessageService;

    constructor(
        @inject(TreeProps) public override readonly props: TreeProps,
        @inject(TreeModel) public override readonly model: TreeViewExampleModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer
    ) {
        super(props, model, contextMenuRenderer);

        // set the general properties for the view
        this.id = TreeViewExampleWidget.ID;
        this.title.label = TreeViewExampleWidget.LABEL;
        this.title.caption = TreeViewExampleWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = 'fa fa-smile-o';

        // register action on double-click / ENTER key
        this.toDispose.push(this.model.onOpenNode((node: TreeNode) => {
            if (ExampleTreeLeaf.is(node) || ExampleTreeNode.is(node)) {
                this.messageService.info(`Example node ${node.data.name} was opened.`);
            }
        }));
    }

    /**
     * Enable icon rendering.
     * 
     * The super implementation is currently empty.
     * This implementation is taken from `file-tree-widget.tsx`.
     * 
     * @param node the node to render
     * @param props the node props (currently transporting the depth of the item in the tree)
     * @returns 
     */
    protected override renderIcon(node: TreeNode, props: NodeProps): React.ReactNode {
        const icon = this.getIconClass(this.toNodeIcon(node));
        if (icon) {
            return <div className={`${icon}`}></div>;
        }
        return super.renderIcon(node, props);
    }

    /**
     * Provide CSS class names for a given tree node.
     * 
     * In our example, we append our own CSS class to all nodes. See/modify the included CSS file for the corresponding style.
     * 
     * @param node the node to render
     * @param props the node props (currently transporting the depth of the item in the tree)
     * @returns the node's CSS classes
     */
    protected override createNodeClassNames(node: TreeNode, props: NodeProps): string[] {
        return super.createNodeClassNames(node, props).concat('theia-example-tree-node');
    }

    /**
     * Provide node element attributes for a given tree node.
     * 
     * In our example, we use this to add Drag & Drop event handlers to the tree nodes.
     * 
     * Note: the Drag & Drop code has been taken and adapted from `file-tree-widget.tsx`
     * 
     * @param node the node to render
     * @param props the node props (currently transporting the depth of the item in the tree)
     * @returns the HTML element attributes.
     */
    protected override createNodeAttributes(node: TreeNode, props: NodeProps): React.Attributes & React.HTMLAttributes<HTMLElement> {
        return {
            ...super.createNodeAttributes(node, props),
            ...this.getNodeDragHandlers(node),
        };
    }

    /**
     * Returns HTML attributes to install Drag & Drop event handlers for the given tree node.
     * 
     * Note: the Drag & Drop code has been taken and adapted from `file-tree-widget.tsx`
     * 
     * @param node the tree node
     * @returns the drag event handlers to be used as additional HTML element attributes
     */
    protected getNodeDragHandlers(node: TreeNode): React.Attributes & React.HtmlHTMLAttributes<HTMLElement> {
        return {
            onDragStart: event => this.handleDragStartEvent(node, event),
            onDragEnter: event => this.handleDragEnterEvent(node, event),
            onDragOver: event => this.handleDragOverEvent(node, event),
            onDragLeave: event => this.handleDragLeaveEvent(node, event),
            onDrop: event => this.handleDropEvent(node, event),
            draggable: ExampleTreeLeaf.is(node),
        };
    }

    /**
     * Handler for the _dragStart_ event.
     * 
     * Stores the ID of the dragged tree node in the Drag & Drop data.
     * 
     * @param node the tree node
     * @param event the event
     */
    protected handleDragStartEvent(node: TreeNode, event: React.DragEvent): void {
        event.stopPropagation();
        if (event.dataTransfer) {
            event.dataTransfer.setData('tree-node', node.id);
        }
    }

    /**
     * Handler for the _dragOver_ event.
     * 
     * Registers deferred tree expansion that shall be triggered if the user hovers over an expandable tree item for 
     * some time.
     * 
     * @param node the tree node
     * @param event the event
     */
    protected handleDragOverEvent(node: TreeNode | undefined, event: React.DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';

        if (!this.toCancelNodeExpansion.disposed) {
            return;
        }

        const timer = setTimeout(() => {
            if (!!node && ExampleTreeNode.is(node) && !node.expanded) {
                this.model.expandNode(node);
            }
        }, 500);
        this.toCancelNodeExpansion.push(Disposable.create(() => clearTimeout(timer)));
    }

    /**
     * Handler for the _dragEnter_ event.
     * 
     * Cancels any pending deferred tree extension, selects the current target node to highlight it in the UI, and 
     * sets the Drag & Drop indicator to "move".
     * 
     * @param node the tree node
     * @param event the event
     */
    protected handleDragEnterEvent(node: TreeNode | undefined, event: React.DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.toCancelNodeExpansion.dispose();

        let target = node;
        if (target && ExampleTreeLeaf.is(target)) {
            target = target.parent;
        }

        if (!!target && ExampleTreeNode.is(target) && !target.selected) {
            this.model.selectNode(target);
        }
    }

    /**
     * Handler for the _dragLeave_ event.
     * 
     * Cancels any pending deferred tree extension.
     * 
     * @param node the tree node
     * @param event the event
     */
    protected handleDragLeaveEvent(node: TreeNode | undefined, event: React.DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.toCancelNodeExpansion.dispose();
    }

    /**
     * Handler for the _drop_ event.
     * 
     * Calls the code to move the dragged node to the new parent.
     * 
     * @param node the tree node
     * @param event the event
     */
    protected async handleDropEvent(node: TreeNode | undefined, event: React.DragEvent): Promise<void> {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';

        let target = node;
        if (target && ExampleTreeLeaf.is(target)) {
            target = target.parent;
        }

        if (!!target && ExampleTreeNode.is(target)) {
            const draggedNodeId = event.dataTransfer.getData('tree-node');
            this.model.reparent(draggedNodeId, target);
        }
    }
}
