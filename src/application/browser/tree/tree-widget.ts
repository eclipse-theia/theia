/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Message } from "@phosphor/messaging";
import { ElementExt } from "@phosphor/domutils";
import { h, ElementAttrs, ElementInlineStyle } from "@phosphor/virtualdom";
import { Disposable } from "../../../application/common";
import { ContextMenuRenderer, VirtualWidget, VirtualRenderer, SELECTED_CLASS, COLLAPSED_CLASS } from "../../../application/browser";
import { ITreeNode, ICompositeTreeNode } from "./tree";
import { ITreeModel } from "./tree-model";
import { IExpandableTreeNode } from "./tree-expansion";
import { ISelectableTreeNode } from "./tree-selection";

export const TREE_CLASS = 'theia-Tree';
export const TREE_NODE_CLASS = 'theia-TreeNode';
export const EXPANDABLE_TREE_NODE_CLASS = 'theia-ExpandableTreeNode';
export const COMPOSITE_TREE_NODE_CLASS = 'theia-CompositeTreeNode';
export const TREE_NODE_CAPTION_CLASS = 'theia-TreeNodeCaption';
export const EXPANSION_TOGGLE_CLASS = 'theia-ExpansionToggle';

export interface Size {
    readonly width: number
    readonly height: number
}

export const TreeProps = Symbol('TreeProps');
export interface TreeProps {
    readonly contextMenuPath?: string;
    readonly expansionToggleSize: Size;
}

export interface NodeProps {
    /**
     * An indentation size relatively to the root node.
     */
    readonly indentSize: number;
    /**
     * Test whether the node should be rendered as hidden.
     *
     * It is different from visibility of a node: an invisible node is not rendered at all.
     */
    readonly visible: boolean;
}

export const defaultTreeProps: TreeProps = {
    expansionToggleSize: {
        width: 16,
        height: 16
    }
}

@injectable()
export class TreeWidget extends VirtualWidget implements EventListenerObject {

    constructor(
        @inject(TreeProps) readonly props: TreeProps,
        @inject(ITreeModel) readonly model: ITreeModel,
        @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer
    ) {
        super();
        this.addClass(TREE_CLASS);
        this.node.tabIndex = 0;
        model.onChanged(() => this.update());
        this.toDispose.push(model);
    }

    onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        if (!this.model.selectedNode && ISelectableTreeNode.is(this.model.root)) {
            this.model.selectNode(this.model.root);
        }
        this.node.focus();
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);

        const selected = this.node.getElementsByClassName(SELECTED_CLASS)[0];
        if (selected) {
            ElementExt.scrollIntoViewIfNeeded(this.node, selected);
        }
    }

    protected render(): h.Child {
        return this.renderTree(this.model);
    }

    protected renderTree(model: ITreeModel): h.Child {
        if (model.root) {
            const props = this.createRootProps(model.root);
            return this.renderNodes(model.root, props);
        }
        return null;
    }

    protected createRootProps(node: ITreeNode): NodeProps {
        return {
            indentSize: 0,
            visible: true
        };
    }

    protected renderNodes(node: ITreeNode, props: NodeProps): h.Child {
        const children = this.renderNodeChildren(node, props);
        if (!ITreeNode.isVisible(node)) {
            return children;
        }
        const parent = this.renderNode(node, props);
        return VirtualRenderer.merge(parent, children);
    }

    protected renderNode(node: ITreeNode, props: NodeProps): h.Child {
        const attributes = this.createNodeAttributes(node, props);
        const caption = this.renderNodeCaption(node, props);
        return h.div(attributes, caption);
    }

    protected createNodeAttributes(node: ITreeNode, props: NodeProps): ElementAttrs {
        const className = this.createNodeClassNames(node, props).join(' ');
        const style = this.createNodeStyle(node, props);
        return {
            className, style,
            onclick: event => this.handleClickEvent(node, event),
            ondblclick: event => this.handleDblClickEvent(node, event),
            oncontextmenu: event => this.handleContextMenuEvent(node, event),
        };
    }

    protected createNodeClassNames(node: ITreeNode, props: NodeProps): string[] {
        const classNames = [TREE_NODE_CLASS];
        if (ICompositeTreeNode.is(node)) {
            classNames.push(COMPOSITE_TREE_NODE_CLASS);
        }
        if (IExpandableTreeNode.is(node)) {
            classNames.push(EXPANDABLE_TREE_NODE_CLASS);
        }
        if (ISelectableTreeNode.isSelected(node)) {
            classNames.push(SELECTED_CLASS);
        }
        return classNames;
    }

    protected createNodeStyle(node: ITreeNode, props: NodeProps): ElementInlineStyle | undefined {
        return {
            paddingLeft: `${props.indentSize}px`,
            display: props.visible ? 'block' : 'none',
        }
    }

    protected renderNodeCaption(node: ITreeNode, props: NodeProps): h.Child {
        return h.div({
            className: TREE_NODE_CAPTION_CLASS
        }, this.decorateCaption(node, node.name, props));
    }

    protected decorateCaption(node: ITreeNode, caption: h.Child, props: NodeProps): h.Child {
        if (IExpandableTreeNode.is(node)) {
            return this.decorateExpandableCaption(node, caption, props);
        }
        return caption;
    }

    protected decorateExpandableCaption(node: IExpandableTreeNode, caption: h.Child, props: NodeProps): h.Child {
        const classNames = [EXPANSION_TOGGLE_CLASS];
        if (!node.expanded) {
            classNames.push(COLLAPSED_CLASS);
        }
        const className = classNames.join(' ');
        const { width, height } = this.props.expansionToggleSize;
        const expansionToggle = h.span({
            className,
            style: {
                width: `${width}px`,
                height: `${height}px`
            },
            onclick: event => {
                this.model.toggleNodeExpansion(node);
                event.stopPropagation();
            }
        });
        return VirtualRenderer.merge(expansionToggle, caption);
    }

    protected renderNodeChildren(node: ITreeNode, props: NodeProps): h.Child {
        if (ICompositeTreeNode.is(node)) {
            return this.renderCompositeChildren(node, props);
        }
        return null;
    }

    protected renderCompositeChildren(parent: ICompositeTreeNode, props: NodeProps): h.Child {
        return VirtualRenderer.flatten(parent.children.map(child => this.renderChild(child, parent, props)));
    }

    protected renderChild(child: ITreeNode, parent: ICompositeTreeNode, props: NodeProps): h.Child {
        const childProps = this.createChildProps(child, parent, props);
        return this.renderNodes(child, childProps)
    }

    protected createChildProps(child: ITreeNode, parent: ICompositeTreeNode, props: NodeProps): NodeProps {
        if (IExpandableTreeNode.is(parent)) {
            return this.createExpandableChildProps(child, parent, props);
        }
        return props;
    }

    protected createExpandableChildProps(child: ITreeNode, parent: IExpandableTreeNode, props: NodeProps): NodeProps {
        if (!props.visible) {
            return props;
        }
        const visible = parent.expanded;
        const { width } = this.props.expansionToggleSize;
        const parentVisibility = ITreeNode.isVisible(parent) ? 1 : 0;
        const childExpansion = IExpandableTreeNode.is(child) ? 0 : 1;
        const indentMultiplier = parentVisibility + childExpansion;
        const relativeIndentSize = width * indentMultiplier;
        const indentSize = props.indentSize + relativeIndentSize;
        return Object.assign({}, props, { visible, indentSize });
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.addEventListener(this.node, 'keydown', this);
        this.addEventListener(this.node, 'contextmenu', this);
        this.addEventListener(this.node, 'click', this);
    }

    handleEvent(event: Event): void {
        if (event.type === 'contextmenu') {
            this.handleContextMenuEvent(this.model.root, event as PointerEvent);
        } else if (event.type === 'keydown' && this.handleKeyDownEvent(event as KeyboardEvent)) {
            event.stopPropagation();
            event.preventDefault();
        } else if (event.type === 'click') {
            this.handleClickEvent(this.model.root, event as MouseEvent);
        }
    }

    protected handleKeyDownEvent(event: KeyboardEvent): boolean {
        if (event.keyCode === 37) { // Left Arrow
            if (!this.model.collapseNode()) {
                this.model.selectParent();
            }
            return true;
        }
        if (event.keyCode === 38) { // Up Arrow
            this.model.selectPrevNode();
            return true;
        }
        if (event.keyCode === 39) { // Right Arrow
            if (!this.model.expandNode()) {
                this.model.selectNextNode();
            }
            return true;
        }
        if (event.keyCode === 40) { // Down Arrow
            this.model.selectNextNode();
            return true;
        }
        if (this.isEnter(event)) {
            this.model.openNode();
            return true;
        }
        return false;
    }

    protected handleClickEvent(node: ITreeNode | undefined, event: MouseEvent): void {
        if (node) {
            if (ISelectableTreeNode.is(node)) {
                this.model.selectNode(node);
            }
            if (IExpandableTreeNode.is(node)) {
                this.model.toggleNodeExpansion(node);
            }
            event.stopPropagation();
        }
    }

    protected handleDblClickEvent(node: ITreeNode | undefined, event: MouseEvent): void {
        this.model.openNode(node);
        event.stopPropagation();
    }

    protected handleContextMenuEvent(node: ITreeNode | undefined, event: MouseEvent): void {
        if (ISelectableTreeNode.is(node)) {
            this.model.selectNode(node);
            const contextMenuPath = this.props.contextMenuPath;
            if (contextMenuPath) {
                this.onRender.push(Disposable.create(() =>
                    setTimeout(() =>
                        this.contextMenuRenderer.render(contextMenuPath, event)
                    )
                ));
            }
            this.update();
        }
        event.stopPropagation();
        event.preventDefault();
    }

}