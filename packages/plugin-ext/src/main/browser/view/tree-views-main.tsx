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

import { interfaces, injectable, inject, Container } from 'inversify';
import { MAIN_RPC_CONTEXT, TreeViewsMain, TreeViewsExt, TreeViewSelection } from '../../../api/plugin-api';
import { Command } from '../../../api/model';
import { RPCProtocol } from '../../../api/rpc-protocol';
import { ViewRegistry } from './view-registry';
import {
    TreeWidget,
    TreeNode,
    NodeProps,
    createTreeContainer,
    SelectableTreeNode,
    ExpandableTreeNode,
    CompositeTreeNode,
    TreeImpl,
    Tree,
    TREE_NODE_SEGMENT_CLASS,
    TREE_NODE_SEGMENT_GROW_CLASS,
    FOLDER_ICON,
    FILE_ICON,
    TREE_NODE_TAIL_CLASS
} from '@theia/core/lib/browser';
import { TreeViewItem, TreeViewItemCollapsibleState } from '../../../api/plugin-api';
import { MenuPath, MenuModelRegistry, ActionMenuNode } from '@theia/core/lib/common/menu';
import * as React from 'react';
import { PluginSharedStyle } from '../plugin-shared-style';
import { ViewContextKeyService } from './view-context-key-service';
import { CommandRegistry } from '@theia/core';

export const TREE_NODE_HYPERLINK = 'theia-TreeNodeHyperlink';
export const VIEW_ITEM_CONTEXT_MENU: MenuPath = ['view-item-context-menu'];
export const VIEW_ITEM_INLINE_MNUE: MenuPath = ['view-item-inline-menu'];

export class TreeViewsMainImpl implements TreeViewsMain {

    private proxy: TreeViewsExt;

    /**
     * key: Tree View ID
     * value: TreeViewDataProviderMain
     */
    private dataProviders: Map<string, TreeViewDataProviderMain> = new Map<string, TreeViewDataProviderMain>();

    private viewRegistry: ViewRegistry;

    private readonly contextKeys: ViewContextKeyService;
    private readonly sharedStyle: PluginSharedStyle;
    private readonly commands: CommandRegistry;

    constructor(rpc: RPCProtocol, private container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.TREE_VIEWS_EXT);
        this.viewRegistry = container.get(ViewRegistry);

        this.contextKeys = this.container.get(ViewContextKeyService);
        this.sharedStyle = this.container.get(PluginSharedStyle);
        this.commands = this.container.get(CommandRegistry);
    }

    $registerTreeDataProvider(treeViewId: string): void {
        const viewPanel = this.viewRegistry.getView(treeViewId);
        if (!viewPanel) {
            console.error('view is not registered: ' + treeViewId);
            return;
        }
        const dataProvider = new TreeViewDataProviderMain(treeViewId, this.proxy, this.sharedStyle);
        this.dataProviders.set(treeViewId, dataProvider);

        const treeViewContainer = this.createTreeViewContainer(dataProvider);
        const treeViewWidget = treeViewContainer.get(TreeViewWidget);
        treeViewWidget.id = treeViewId;
        treeViewWidget.addClass('theia-tree-view');
        treeViewWidget.node.style.height = '100%';
        viewPanel.addWidget(treeViewWidget);
        const root: CompositeTreeNode & ExpandableTreeNode = {
            id: '',
            parent: undefined,
            name: '',
            visible: false,
            expanded: true,
            children: []
        };
        treeViewWidget.model.root = root;

        this.handleTreeEvents(treeViewId, treeViewWidget);
    }

    protected getTreeViewWidget(treeViewId: string): TreeViewWidget | undefined {
        const viewPanel = this.viewRegistry.getView(treeViewId);
        const widget = viewPanel && viewPanel.widgets[0];
        return widget instanceof TreeViewWidget && widget || undefined;
    }

    $refresh(treeViewId: string): void {
        const treeViewWidget = this.getTreeViewWidget(treeViewId);
        if (treeViewWidget) {
            treeViewWidget.model.refresh();
        }
    }

    // tslint:disable-next-line:no-any
    async $reveal(treeViewId: string, treeItemId: string): Promise<any> {
        const treeViewWidget = this.getTreeViewWidget(treeViewId);
        if (treeViewWidget) {
            const treeNode = treeViewWidget.model.getNode(treeItemId);
            if (treeNode && SelectableTreeNode.is(treeNode)) {
                treeViewWidget.model.selectNode(treeNode);
            }
        }
    }

    createTreeViewContainer(dataProvider: TreeViewDataProviderMain): Container {
        const child = createTreeContainer(this.container, {
            contextMenuPath: VIEW_ITEM_CONTEXT_MENU,
            globalSelection: true
        });

        child.bind(TreeViewDataProviderMain).toConstantValue(dataProvider);

        child.unbind(TreeImpl);
        child.bind(PluginTree).toSelf();
        child.rebind(Tree).toDynamicValue(ctx => ctx.container.get(PluginTree));

        child.unbind(TreeWidget);
        child.bind(TreeViewWidget).toSelf();

        return child;
    }

    handleTreeEvents(treeViewId: string, treeViewWidget: TreeViewWidget) {
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

export interface CompositeTreeViewNode extends TreeViewNode, ExpandableTreeNode, CompositeTreeNode {
}

export class TreeViewDataProviderMain {

    constructor(
        private treeViewId: string,
        private proxy: TreeViewsExt,
        private sharedStyle: PluginSharedStyle
    ) { }

    createFolderNode(item: TreeViewItem): CompositeTreeViewNode {
        const expanded = TreeViewItemCollapsibleState.Expanded === item.collapsibleState;
        const icon = this.toIconClass(item);
        return {
            id: item.id,
            parent: undefined,
            name: item.label,
            icon,
            description: item.tooltip,
            visible: true,
            selected: false,
            expanded,
            children: [],
            contextValue: item.contextValue
        };
    }

    createFileNode(item: TreeViewItem): TreeViewNode {
        const icon = this.toIconClass(item);
        return {
            id: item.id,
            name: item.label,
            icon,
            description: item.tooltip,
            parent: undefined,
            visible: true,
            selected: false,
            contextValue: item.contextValue,
            command: item.command
        };
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

    /**
     * Creates TreeNode
     *
     * @param item tree view item from the ext
     */
    createTreeNode(item: TreeViewItem): TreeNode {
        if (item.collapsibleState !== TreeViewItemCollapsibleState.None) {
            return this.createFolderNode(item);
        }
        return this.createFileNode(item);
    }

    async resolveChildren(itemId: string): Promise<TreeNode[]> {
        const children = await this.proxy.$getChildren(this.treeViewId, itemId);

        if (children) {
            return children.map(value => this.createTreeNode(value));
        }

        return [];
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

@injectable()
export class PluginTree extends TreeImpl {

    constructor(@inject(TreeViewDataProviderMain) private readonly dataProvider: TreeViewDataProviderMain) {
        super();
    }

    protected async resolveChildren(parent: CompositeTreeNode): Promise<TreeNode[]> {
        return this.dataProvider.resolveChildren(parent.id);
    }

}
