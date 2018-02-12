/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, /*postConstruct*/ } from "inversify";
import { Message } from "@phosphor/messaging";
import { ElementExt } from "@phosphor/domutils";
import { h, ElementAttrs, ElementInlineStyle } from "@phosphor/virtualdom";
import { Disposable, MenuPath } from "../../common";
import { Key } from "../keys";
import { ContextMenuRenderer } from "../context-menu-renderer";
import { StatefulWidget } from '../shell';
import { VirtualWidget, VirtualRenderer, SELECTED_CLASS, COLLAPSED_CLASS } from "../widgets";
import { ITreeNode, ICompositeTreeNode } from "./tree";
import { ITreeModel } from "./tree-model";
import { IExpandableTreeNode } from "./tree-expansion";
import { ISelectableTreeNode } from "./tree-selection";
import { DecorationData, TreeDecoratorService, DecoratorStyles, IconOverlayPosition, IconOverlay, FontData } from "./tree-decorator";
import { notEmpty } from '../../common/utils';

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
    readonly contextMenuPath?: MenuPath;
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
};

@injectable()
export class TreeWidget extends VirtualWidget implements StatefulWidget {

    protected decorations: Map<string, DecorationData[]> = new Map();

    constructor(
        @inject(TreeProps) readonly props: TreeProps,
        @inject(ITreeModel) readonly model: ITreeModel,
        @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer,
        @inject(TreeDecoratorService) protected readonly decoratorService: TreeDecoratorService
    ) {
        super();
        this.addClass(TREE_CLASS);
        this.node.tabIndex = 0;
        model.onChanged(() => this.update());
        this.toDispose.push(model);
        this.decoratorService.onDidChangeDecorations(decorations => {
            this.decorations = decorations;
            if (this.render() !== null) {
                this.update();
            }
        });
    }

    protected onActivateRequest(msg: Message): void {
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
            return this.renderSubTree(model.root, props);
        }
        // tslint:disable-next-line:no-null-keyword
        return null;
    }

    protected createRootProps(node: ITreeNode): NodeProps {
        return {
            indentSize: 0,
            visible: true
        };
    }

    protected renderSubTree(node: ITreeNode, props: NodeProps): h.Child {
        const children = this.renderNodeChildren(node, props);
        if (!ITreeNode.isVisible(node)) {
            return children;
        }
        const parent = this.renderNode(node, props);
        return VirtualRenderer.merge(parent, children);
    }

    protected renderIcon(node: ITreeNode, props: NodeProps): h.Child {
        // tslint:disable-next-line:no-null-keyword
        return null;
    }

    protected renderExpansionToggle(node: ITreeNode, props: NodeProps): h.Child {
        if (!this.isExpandable(node)) {
            // tslint:disable-next-line:no-null-keyword
            return null;
        }
        const classNames = [EXPANSION_TOGGLE_CLASS];
        if (!node.expanded) {
            classNames.push(COLLAPSED_CLASS);
        }
        const className = classNames.join(' ');
        const { width, height } = this.props.expansionToggleSize;
        return h.span({
            className,
            style: {
                width: `${width}px`,
                height: `${height}px`
            },
            onclick: event => {
                this.handleClickEvent(node, event);
                event.stopPropagation();
            }
        });
    }

    protected renderCaption(node: ITreeNode, props: NodeProps): h.Child {
        const tooltip = this.getDecorationData(node, 'tooltip').filter(notEmpty).join(' • ');
        let attrs = this.decorateCaption(node, {
            className: TREE_NODE_CAPTION_CLASS
        });
        if (tooltip.length > 0) {
            attrs = {
                ...attrs,
                title: tooltip
            };
        }
        return h.div(attrs, node.name);
    }

    protected decorateCaption(node: ITreeNode, attrs: ElementAttrs): ElementAttrs {
        const style = this.getDecorationData(node, 'fontData').filter(notEmpty).reverse().map(fontData => this.applyFontStyles({}, fontData)).reduce((acc, current) =>
            ({
                ...acc,
                ...current
            })
            , {});
        return {
            ...attrs,
            style
        };
    }

    protected applyFontStyles(original: ElementInlineStyle, fontData: FontData | undefined) {
        if (fontData === undefined) {
            return original;
        }
        let modified = original;
        const { color, style } = fontData;
        if (color) {
            modified = {
                ...modified,
                color
            };
        }
        if (style) {
            (Array.isArray(style) ? style : [style]).forEach(s => {
                switch (style) {
                    case 'bold':
                        modified = {
                            ...modified,
                            fontWeight: style
                        };
                        break;
                    case 'normal': // Fall through.
                    case 'oblique': // Fall through.
                    case 'italic':
                        modified = {
                            ...modified,
                            fontStyle: style
                        };
                        break;
                    case 'underline': // Fall through.
                    case 'line-through':
                        modified = {
                            ...modified,
                            textDecoration: style
                        };
                        break;
                    default:
                        throw new Error(`Unexpected font style: ${style}.`);
                }
            });
        }
        return modified;
    }

    protected renderCaptionSuffixes(node: ITreeNode, props: NodeProps): h.Child[] {
        return this.getDecorationData(node, 'captionSuffix').filter(notEmpty).reduce((acc, current) => acc.concat(current), []).map(suffix => {
            const style = this.applyFontStyles({}, suffix.fontData);
            const attrs = {
                className: DecoratorStyles.CAPTION_SUFFIX,
                style
            };
            return h.div(attrs, suffix.data);
        });
    }

    protected renderCaptionPrefix(node: ITreeNode, props: NodeProps): h.Child {
        const prefix = this.getDecorationData(node, 'captionPrefix').filter(notEmpty).shift();
        if (prefix) {
            const style = this.applyFontStyles({}, prefix.fontData);
            const attrs = {
                className: DecoratorStyles.CAPTION_PREFIX,
                style
            };
            return h.div(attrs, prefix.data);
        }
        // tslint:disable-next-line:no-null-keyword
        return null;
    }

    protected renderSuffix(node: ITreeNode, props: NodeProps): h.Child {
        // tslint:disable-next-line:no-null-keyword
        return null;
    }

    protected decorateIcon(node: ITreeNode, icon: h.Child | null): h.Child {
        if (icon === null) {
            // tslint:disable-next-line:no-null-keyword
            return null;
        }

        const overlayIcons: h.Child = [];
        new Map(this.getDecorationData(node, 'iconOverlay').reverse().filter(notEmpty)
            .map(overlay => [overlay.position, overlay] as [IconOverlayPosition, IconOverlay]))
            .forEach((overlay, position) => {
                const className = ['a', 'fa', `fa-${overlay.icon}`, DecoratorStyles.DECORATOR_SIZE, IconOverlayPosition.getStyle(position)].join(' ');
                const { color } = overlay;
                let style = {};
                if (color) {
                    style = {
                        ...style,
                        color
                    };
                }
                overlayIcons.push(h.span({ className, style }));
            });

        if (overlayIcons.length > 0) {
            return h.div({ className: DecoratorStyles.ICON_WRAPPER }, VirtualRenderer.merge(icon, overlayIcons));
        }

        return icon;
    }

    protected renderNode(node: ITreeNode, props: NodeProps): h.Child {
        const attributes = this.createNodeAttributes(node, props);
        return h.div(attributes,
            this.decorateIcon(node, this.renderIcon(node, props)),
            this.renderExpansionToggle(node, props),
            this.renderCaptionPrefix(node, props),
            this.renderCaption(node, props),
            ...this.renderCaptionSuffixes(node, props),
            this.renderSuffix(node, props)
        );
    }

    protected createNodeAttributes(node: ITreeNode, props: NodeProps): ElementAttrs {
        const className = this.createNodeClassNames(node, props).join(' ');
        const style = this.createNodeStyle(node, props);
        return {
            className,
            style,
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
        if (this.isExpandable(node)) {
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
            display: props.visible ? 'flex' : 'none',
            alignItems: 'center'
        };
    }

    protected isExpandable(node: ITreeNode): node is IExpandableTreeNode {
        return IExpandableTreeNode.is(node);
    }

    protected renderNodeChildren(node: ITreeNode, props: NodeProps): h.Child {
        if (ICompositeTreeNode.is(node)) {
            return this.renderCompositeChildren(node, props);
        }
        // tslint:disable-next-line:no-null-keyword
        return null;
    }

    protected renderCompositeChildren(parent: ICompositeTreeNode, props: NodeProps): h.Child {
        return VirtualRenderer.flatten(parent.children.map(child => this.renderChild(child, parent, props)));
    }

    protected renderChild(child: ITreeNode, parent: ICompositeTreeNode, props: NodeProps): h.Child {
        const childProps = this.createChildProps(child, parent, props);
        return this.renderSubTree(child, childProps);
    }

    protected createChildProps(child: ITreeNode, parent: ICompositeTreeNode, props: NodeProps): NodeProps {
        if (this.isExpandable(parent)) {
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
        const childExpansion = this.isExpandable(child) ? 0 : 1;
        const indentMultiplier = parentVisibility + childExpansion;
        const relativeIndentSize = width * indentMultiplier;
        const indentSize = props.indentSize + relativeIndentSize;
        return Object.assign({}, props, { visible, indentSize });
    }

    protected getDecorations(node: ITreeNode): DecorationData[] {
        const decorations = this.decorations.get(node.id);
        if (decorations) {
            return decorations.sort(DecorationData.compare);
        }
        return [];
    }

    protected getDecorationData<K extends keyof DecorationData>(node: ITreeNode, key: K): DecorationData[K][] {
        return this.getDecorations(node).filter(data => data[key] !== undefined).map(data => data[key]).filter(notEmpty);
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.addKeyListener(this.node, Key.ARROW_LEFT, () => this.handleLeft());
        this.addKeyListener(this.node, Key.ARROW_RIGHT, () => this.handleRight());
        this.addKeyListener(this.node, Key.ARROW_UP, () => this.handleUp());
        this.addKeyListener(this.node, Key.ARROW_DOWN, () => this.handleDown());
        this.addKeyListener(this.node, Key.ENTER, () => this.handleEnter());
        this.addEventListener(this.node, 'contextmenu', e => this.handleContextMenuEvent(this.model.root, e));
        this.addEventListener(this.node, 'click', e => this.handleClickEvent(this.model.root, e));
    }

    protected handleLeft(): void {
        if (!this.model.collapseNode()) {
            this.model.selectParent();
        }
    }

    protected handleRight(): void {
        if (!this.model.expandNode()) {
            this.model.selectNextNode();
        }
    }

    protected handleUp(): void {
        this.model.selectPrevNode();
    }

    protected handleDown(): void {
        this.model.selectNextNode();
    }

    protected handleEnter(): void {
        this.model.openNode();
    }

    protected handleClickEvent(node: ITreeNode | undefined, event: MouseEvent): void {
        if (node) {
            if (ISelectableTreeNode.is(node)) {
                this.model.selectNode(node);
            }
            if (this.isExpandable(node)) {
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

    protected deflateForStorage(node: ITreeNode): object {
        // tslint:disable-next-line:no-any
        const copy = Object.assign({}, node) as any;
        if (copy.parent) {
            delete copy.parent;
        }
        if (ICompositeTreeNode.is(node)) {
            copy.children = [];
            for (const child of node.children) {
                copy.children.push(this.deflateForStorage(child));
            }
        }
        return copy;
    }

    // tslint:disable-next-line:no-any
    protected inflateFromStorage(node: any, parent?: ITreeNode): ITreeNode {
        if (node.selected) {
            node.selected = false;
        }
        if (parent) {
            node.parent = parent;
        }
        if (Array.isArray(node.children)) {
            for (const child of node.children as ITreeNode[]) {
                this.inflateFromStorage(child, node);
            }
        }
        return node;
    }

    storeState(): object {
        if (this.model.root) {
            return {
                root: this.deflateForStorage(this.model.root)
            };
        } else {
            return {};
        }
    }

    restoreState(oldState: object): void {
        // tslint:disable-next-line:no-any
        if ((oldState as any).root) {
            // tslint:disable-next-line:no-any
            this.model.root = this.inflateFromStorage((oldState as any).root);
        }
    }

}
