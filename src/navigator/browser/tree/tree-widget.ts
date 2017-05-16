/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { decorate, injectable, inject } from "inversify";
import { Widget } from "@phosphor/widgets";
import { Message } from "@phosphor/messaging";
import { ElementExt } from "@phosphor/domutils";
import { h, VirtualNode, VirtualText, VirtualDOM, ElementAttrs, ElementInlineStyle } from "@phosphor/virtualdom";
import { DisposableCollection, Disposable } from "../../../application/common";
import { ITreeNode, ICompositeTreeNode } from "./tree";
import { ITreeModel } from "./tree-model";
import { IExpandableTreeNode } from "./tree-expansion";
import { ISelectableTreeNode } from "./tree-selection";
import { ContextMenuRenderer } from "../../../application/browser/menu/context-menu-renderer";

export const TREE_CLASS = 'theia-Tree';
export const TREE_NODE_CLASS = 'theia-TreeNode';
export const EXPANDABLE_TREE_NODE_CLASS = 'theia-ExpandableTreeNode';
export const COMPOSITE_TREE_NODE_CLASS = 'theia-CompositeTreeNode';
export const TREE_NODE_CAPTION_CLASS = 'theia-TreeNodeCaption';
export const EXPANSION_TOGGLE_CLASS = 'theia-ExpansionToggle';
export const COLLAPSED_CLASS = 'theia-mod-collapsed';
export const SELECTED_CLASS = 'theia-mod-selected';

decorate(injectable(), Widget)

@injectable()
export abstract class AbstractTreeWidget<
    Model extends ITreeModel,
    TreeProps extends TreeWidget.TreeProps,
    NodeProps extends TreeWidget.NodeProps> extends Widget implements EventListenerObject {

    /**
     * FIXME extract to VirtualWidget
     */
    protected model: Model | undefined;
    protected modelListeners = new DisposableCollection();
    protected readonly onRender = new DisposableCollection();

    constructor(
        protected readonly props: TreeProps,
        protected readonly contextMenuRenderer: ContextMenuRenderer) {
        super();
        this.addClass(TREE_CLASS);
        this.node.tabIndex = 0;
    }

    getModel() {
        return this.model;
    }

    setModel(model: Model | undefined) {
        if (this.model !== model) {
            this.modelListeners.dispose();
            this.model = model;
            if (model) {
                this.modelListeners.push(model.onChanged(() => this.update()));
            }
            this.update();
        }
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        const children = this.render();
        const content = VirtualWidget.toContent(children);
        VirtualDOM.render(content, this.node);

        const selected = this.node.getElementsByClassName(SELECTED_CLASS)[0];
        if (selected) {
            ElementExt.scrollIntoViewIfNeeded(this.node, selected)
        }
        this.onRender.dispose();
    }

    protected render(): h.Child {
        if (this.model) {
            return this.renderTree(this.model);
        }
        return null;
    }

    protected renderTree(model: Model): h.Child {
        if (model.root) {
            const props = this.createRootProps(model.root);
            return this.renderNodes(model.root, props);
        }
        return null;
    }

    protected abstract createRootProps(node: ITreeNode): NodeProps;

    protected renderNodes(node: ITreeNode, props: NodeProps): h.Child {
        const children = this.renderNodeChildren(node, props);
        if (!ITreeNode.isVisible(node)) {
            return children;
        }
        const parent = this.renderNode(node, props);
        return VirtualWidget.merge(parent, children);
    }

    protected renderNode(node: ITreeNode, props: NodeProps): h.Child {
        const attributes = this.createNodeAttributes(node, props);
        const caption = this.renderNodeCaption(node, props);
        return h.div(attributes, caption);
    }

    protected showContextMenu(event: MouseEvent, node: ITreeNode | undefined): boolean {
        if (this.model && ISelectableTreeNode.is(node)) {
            this.model.selectNode(node);
            if (this.props.contextMenuPath) {
                this.onRender.push(Disposable.create(() =>
                    setTimeout(() => {
                        this.contextMenuRenderer.render(
                            this.props.contextMenuPath!,
                            event
                        );
                    })
                ));
            }
            this.update();
        }
        event.stopPropagation()
        event.preventDefault()
        return false
    }
    protected selectNode(event: MouseEvent, node: ITreeNode | undefined): void {
        if (this.model && ISelectableTreeNode.is(node)) {
            this.model.selectNode(node);
            event.stopPropagation();
        }
    }

    protected createNodeAttributes(node: ITreeNode, props: NodeProps): ElementAttrs {
        const className = this.createNodeClassNames(node, props).join(' ');
        const style = this.createNodeStyle(node, props);
        return {
            className, style,
            onclick: (event) => {
                this.selectNode(event, node)
            },
            ondblclick: (event) => {
                if (this.model) {
                    this.model.openNode(node);
                    event.stopPropagation();
                }
            },
            oncontextmenu: (event) => {
                this.showContextMenu(event, node)
            },
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
            onclick: (event) => {
                if (this.model) {
                    this.model.toggleNodeExpansion(node);
                    event.stopPropagation();
                }
            }
        });
        return VirtualWidget.merge(expansionToggle, caption);
    }

    protected renderNodeChildren(node: ITreeNode, props: NodeProps): h.Child {
        if (ICompositeTreeNode.is(node)) {
            return this.renderCompositeChildren(node, props);
        }
        return null;
    }

    protected renderCompositeChildren(parent: ICompositeTreeNode, props: NodeProps): h.Child {
        return VirtualWidget.flatten(parent.children.map(child => this.renderChild(child, parent, props)));
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
        this.node.addEventListener('keydown', this);
    }

    protected onBeforeDetach(msg: Message): void {
        this.node.removeEventListener('keydown', this);
        super.onBeforeDetach(msg);
    }

    handleEvent(event: Event): void {
        if (event.type === 'keydown' && this.handleKeyDown(event as KeyboardEvent)) {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    protected handleKeyDown(event: KeyboardEvent): boolean {
        if (this.model) {
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
            if (event.keyCode === 13) { // Enter
                this.model.openNode();
                return true;
            }
        }
        return false;
    }

}

export class TreeWidget<Model extends ITreeModel> extends AbstractTreeWidget<Model, TreeWidget.TreeProps, TreeWidget.NodeProps> {

    // tslint:disable-next-line:no-use-before-declare https://github.com/palantir/tslint/issues/884
    constructor(
        props: TreeWidget.TreeProps,
        @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer) {
        super(props, contextMenuRenderer);
    }

    protected createRootProps(node: ITreeNode): TreeWidget.NodeProps {
        return {
            indentSize: 0,
            visible: true
        };
    }

}

export namespace TreeWidget {
    export interface Size {
        readonly width: number
        readonly height: number
    }
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
    export const DEFAULT_PROPS: TreeProps = {
        expansionToggleSize: {
            width: 16,
            height: 16
        }
    }
}

export namespace VirtualWidget {
    export function flatten(children: h.Child[]): h.Child {
        return children.reduce((prev, current) => merge(prev, current), null);
    }

    export function merge(left: h.Child | undefined, right: h.Child | undefined): h.Child {
        if (!right) {
            return left || null;
        }
        if (!left) {
            return right;
        }
        const result = left instanceof Array ? left : [left];
        if (right instanceof Array) {
            result.push(...right);
        } else {
            result.push(right);
        }
        return result;
    }

    export function toContent(children: h.Child): VirtualNode | VirtualNode[] | null {
        if (!children) {
            return null;
        }
        if (typeof children === "string") {
            return new VirtualText(children);
        }
        if (children instanceof Array) {
            const nodes: VirtualNode[] = [];
            for (const child of children) {
                if (child) {
                    const node = typeof child === "string" ? new VirtualText(child) : child;
                    nodes.push(node);
                }
            }
            return nodes;
        }
        return children;
    }
}
