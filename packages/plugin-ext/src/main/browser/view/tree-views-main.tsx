/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { interfaces, injectable, inject, postConstruct } from 'inversify';
import { MAIN_RPC_CONTEXT, TreeViewsMain, TreeViewsExt, TreeViewSelection } from '../../../api/plugin-api';
import { Command } from '../../../api/model';
import { RPCProtocol } from '../../../api/rpc-protocol';
import { PluginViewRegistry, PLUGIN_VIEW_DATA_FACTORY_ID } from './plugin-view-registry';
import {
    TreeWidget,
    TreeNode,
    NodeProps,
    SelectableTreeNode,
    ExpandableTreeNode,
    CompositeTreeNode,
    TreeImpl,
    TREE_NODE_SEGMENT_CLASS,
    TREE_NODE_SEGMENT_GROW_CLASS,
    FOLDER_ICON,
    FILE_ICON,
    TREE_NODE_TAIL_CLASS,
    WidgetManager,
    TreeModelImpl
} from '@theia/core/lib/browser';
import { TreeViewItem, TreeViewItemCollapsibleState } from '../../../api/plugin-api';
import { MenuPath, MenuModelRegistry, ActionMenuNode } from '@theia/core/lib/common/menu';
import * as React from 'react';
import { PluginSharedStyle } from '../plugin-shared-style';
import { ViewContextKeyService } from './view-context-key-service';
import { CommandRegistry, Disposable } from '@theia/core';

export const TREE_NODE_HYPERLINK = 'theia-TreeNodeHyperlink';
export const VIEW_ITEM_CONTEXT_MENU: MenuPath = ['view-item-context-menu'];
export const VIEW_ITEM_INLINE_MNUE: MenuPath = ['view-item-inline-menu'];

export class TreeViewsMainImpl implements TreeViewsMain {

    private readonly proxy: TreeViewsExt;
    private readonly viewRegistry: PluginViewRegistry;
    private readonly contextKeys: ViewContextKeyService;
    private readonly commands: CommandRegistry;
    private readonly widgetManager: WidgetManager;

    private readonly treeViewProviders = new Map<string, Disposable>();

    constructor(rpc: RPCProtocol, private container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.TREE_VIEWS_EXT);
        this.viewRegistry = container.get(PluginViewRegistry);

        this.contextKeys = this.container.get(ViewContextKeyService);
        this.commands = this.container.get(CommandRegistry);
        this.widgetManager = this.container.get(WidgetManager);
    }

    async $registerTreeDataProvider(treeViewId: string): Promise<void> {
        this.treeViewProviders.set(treeViewId, this.viewRegistry.registerViewDataProvider(treeViewId, async state => {
            const widget = await this.widgetManager.getOrCreateWidget<TreeViewWidget>(PLUGIN_VIEW_DATA_FACTORY_ID, { id: treeViewId });
            if (state) {
                widget.restoreState(state);
            } else {
                const root: CompositeTreeNode & ExpandableTreeNode = {
                    id: '',
                    parent: undefined,
                    name: '',
                    visible: false,
                    expanded: true,
                    children: []
                };
                widget.model.root = root;
            }
            widget.model.proxy = this.proxy;
            await widget.model.refresh();
            this.handleTreeEvents(widget.id, widget);
            return widget;
        }));
        await this.viewRegistry.openView(treeViewId);
    }

    async $unregisterTreeDataProvider(treeViewId: string): Promise<void> {
        const treeDataProvider = this.treeViewProviders.get(treeViewId);
        if (treeDataProvider) {
            this.treeViewProviders.delete(treeViewId);
            treeDataProvider.dispose();
        }
        const treeViewWidget = await this.widgetManager.getWidget<TreeViewWidget>(PLUGIN_VIEW_DATA_FACTORY_ID, { id: treeViewId });
        if (treeViewWidget) {
            treeViewWidget.dispose();
        }
    }

    async $refresh(treeViewId: string): Promise<void> {
        const viewPanel = await this.viewRegistry.getView(treeViewId);
        const widget = viewPanel && viewPanel.widgets[0];
        if (widget instanceof TreeViewWidget) {
            await widget.model.refresh();
        }
    }

    // tslint:disable-next-line:no-any
    async $reveal(treeViewId: string, treeItemId: string): Promise<any> {
        const viewPanel = await this.viewRegistry.openView(treeViewId);
        const widget = viewPanel && viewPanel.widgets[0];
        if (widget instanceof TreeViewWidget) {
            const treeNode = widget.model.getNode(treeItemId);
            if (treeNode && SelectableTreeNode.is(treeNode)) {
                widget.model.selectNode(treeNode);
            }
        }
    }

    protected handleTreeEvents(treeViewId: string, treeViewWidget: TreeViewWidget) {
        treeViewWidget.model.onExpansionChanged(event => {
            this.proxy.$setExpanded(treeViewId, event.id, event.expanded);
        });

        treeViewWidget.model.onSelectionChanged(event => {
            if (event.length === 1) {
                const { contextValue } = event[0] as TreeViewNode;
                this.contextKeys.viewItem.set(contextValue);
            } else {
                this.contextKeys.viewItem.set('');
            }
            this.contextKeys.view.set(treeViewId);

            // execute TreeItem.command if present
            const treeNode = event[0] as TreeViewNode;
            if (treeNode && treeNode.command) {
                this.commands.executeCommand(treeNode.command.id, ...(treeNode.command.arguments || []));
            }
        });
    }

}

export interface SelectionEventHandler {
    readonly node: SelectableTreeNode;
    readonly contextSelection: boolean;
}

export interface TreeViewNode extends SelectableTreeNode {
    contextValue?: string;
    command?: Command;
}
export namespace TreeViewNode {
    export function is(arg: TreeNode | undefined): arg is TreeViewNode {
        return !!arg && SelectableTreeNode.is(arg) && !ExpandableTreeNode.is(arg) && !CompositeTreeNode.is(arg);
    }
}

export interface CompositeTreeViewNode extends TreeViewNode, ExpandableTreeNode, CompositeTreeNode {
}
export namespace CompositeTreeViewNode {
    export function is(arg: TreeNode | undefined): arg is CompositeTreeViewNode {
        return !!arg && SelectableTreeNode.is(arg) && ExpandableTreeNode.is(arg) && CompositeTreeNode.is(arg);
    }
}

@injectable()
export class TreeViewWidgetIdentifier {
    id: string;
}

@injectable()
export class PluginTree extends TreeImpl {

    @inject(PluginSharedStyle)
    protected readonly sharedStyle: PluginSharedStyle;

    @inject(TreeViewWidgetIdentifier)
    protected readonly identifier: TreeViewWidgetIdentifier;

    private _proxy: TreeViewsExt | undefined;

    set proxy(proxy: TreeViewsExt) {
        this._proxy = proxy;
    }

    protected async resolveChildren(parent: CompositeTreeNode): Promise<TreeNode[]> {
        if (!this._proxy) {
            return super.resolveChildren(parent);
        }
        const children = await this._proxy.$getChildren(this.identifier.id, parent.id);
        return children ? children.map(value => this.createTreeNode(value, parent)) : [];
    }

    protected createTreeNode(item: TreeViewItem, parent: CompositeTreeNode): TreeNode {
        const icon = this.toIconClass(item);
        const update = {
            name: item.label,
            icon,
            description: item.tooltip,
            contextValue: item.contextValue
        };
        const node = this.getNode(item.id);
        if (item.collapsibleState !== TreeViewItemCollapsibleState.None) {
            if (CompositeTreeViewNode.is(node)) {
                return Object.assign(node, update);
            }
            return Object.assign({
                id: item.id,
                parent,
                visible: true,
                selected: false,
                expanded: TreeViewItemCollapsibleState.Expanded === item.collapsibleState,
                children: []
            }, update);
        }
        if (TreeViewNode.is(node)) {
            return Object.assign(node, update);
        }
        return Object.assign({
            id: item.id,
            parent,
            visible: true,
            selected: false
        }, update);
    }

    protected toIconClass(item: TreeViewItem): string | undefined {
        if (item.icon) {
            return 'fa ' + item.icon;
        }
        if (item.iconUrl) {
            return this.sharedStyle.toIconClass(item.iconUrl);
        }
        if (item.themeIconId) {
            return item.themeIconId === 'folder' ? FOLDER_ICON : FILE_ICON;
        }
        if (item.resourceUri) {
            return item.collapsibleState !== TreeViewItemCollapsibleState.None ? FOLDER_ICON : FILE_ICON;
        }
        return undefined;
    }

}

@injectable()
export class PluginTreeModel extends TreeModelImpl {

    @inject(PluginTree)
    protected readonly tree: PluginTree;

    set proxy(proxy: TreeViewsExt) {
        this.tree.proxy = proxy;
    }

}

@injectable()
export class TreeViewWidget extends TreeWidget {

    protected _contextSelection = false;

    @inject(MenuModelRegistry)
    protected readonly menus: MenuModelRegistry;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(ViewContextKeyService)
    protected readonly contextKeys: ViewContextKeyService;

    @inject(TreeViewWidgetIdentifier)
    readonly identifier: TreeViewWidgetIdentifier;

    @inject(PluginTreeModel)
    readonly model: PluginTreeModel;

    @postConstruct()
    protected init(): void {
        super.init();
        this.id = this.identifier.id;
        this.addClass('theia-tree-view');
        this.node.style.height = '100%';
    }

    protected renderIcon(node: TreeNode, props: NodeProps): React.ReactNode {
        if (node.icon) {
            return <div className={node.icon + ' theia-tree-view-icon'}></div>;
        }
        return undefined;
    }

    protected renderCaption(node: TreeNode, props: NodeProps): React.ReactNode {
        const classes = [TREE_NODE_SEGMENT_CLASS];
        if (!this.hasTrailingSuffixes(node)) {
            classes.push(TREE_NODE_SEGMENT_GROW_CLASS);
        }
        const className = classes.join(' ');
        let attrs = this.decorateCaption(node, {
            className, id: node.id
        });

        if (node.description) {
            attrs = {
                ...attrs,
                title: node.description
            };
        }

        const children = this.getCaption(node);
        return React.createElement('div', attrs, ...children);
    }

    protected getCaption(node: TreeNode): React.ReactNode[] {
        const nodes: React.ReactNode[] = [];

        let work = node.name;

        const regex = /\[([^\[]+)\]\(([^\)]+)\)/g;
        const matchResult = node.name.match(regex);

        if (matchResult) {
            matchResult.forEach(match => {
                const part = work.substring(0, work.indexOf(match));
                nodes.push(part);

                const execResult = regex.exec(node.name);
                const link = <a href={execResult![2]}
                    target='_blank'
                    className={TREE_NODE_HYPERLINK}
                    onClick={e => e.stopPropagation()}>{execResult![1]}</a >;
                nodes.push(link);

                work = work.substring(work.indexOf(match) + match.length);
            });
        }

        nodes.push(work);
        return nodes;
    }

    protected renderTailDecorations(node: TreeViewNode, props: NodeProps): React.ReactNode {
        if (this.model.selectedNodes.every(selected => selected.id !== node.id) && node.id !== this.hoverNodeId) {
            return false;
        }
        return this.contextKeys.with({ view: this.id, viewItem: node.contextValue }, () => {
            const menu = this.menus.getMenu(VIEW_ITEM_INLINE_MNUE);
            const arg = this.toTreeViewSelection(node);
            return <React.Fragment>
                {menu.children.map((item, index) => item instanceof ActionMenuNode && this.renderInlineCommand(item, index, arg))}
            </React.Fragment>;
        });
    }

    toTreeViewSelection(node: TreeNode): TreeViewSelection {
        return { treeViewId: this.id, treeItemId: node.id };
    }

    // tslint:disable-next-line:no-any
    protected renderInlineCommand(node: ActionMenuNode, index: number, arg: any): React.ReactNode {
        const { icon } = node;
        if (!icon || !this.commands.isVisible(node.action.commandId, arg) || !this.contextKeys.match(node.action.when)) {
            return false;
        }
        const className = [TREE_NODE_SEGMENT_CLASS, TREE_NODE_TAIL_CLASS, icon, 'theia-tree-view-inline-action'].join(' ');
        return <div key={index} className={className} title={node.label} onClick={e => {
            e.stopPropagation();
            this.commands.executeCommand(node.action.commandId, arg);
        }} />;
    }

    protected hoverNodeId: string | undefined;
    protected setHoverNodeId(hoverNodeId: string | undefined): void {
        this.hoverNodeId = hoverNodeId;
        this.update();
    }

    protected createNodeAttributes(node: TreeNode, props: NodeProps): React.Attributes & React.HTMLAttributes<HTMLElement> {
        return {
            ...super.createNodeAttributes(node, props),
            onMouseOver: () => this.setHoverNodeId(node.id),
            onMouseOut: () => this.setHoverNodeId(undefined)
        };
    }

    protected toContextMenuArgs(node: SelectableTreeNode): [TreeViewSelection] {
        return [this.toTreeViewSelection(node)];
    }

}
