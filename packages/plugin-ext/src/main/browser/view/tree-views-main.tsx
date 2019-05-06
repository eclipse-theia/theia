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
import { MAIN_RPC_CONTEXT, TreeViewsMain, TreeViewsExt } from '../../../api/plugin-api';
import { RPCProtocol } from '../../../api/rpc-protocol';
import { ViewRegistry } from './view-registry';
import { Message } from '@phosphor/messaging';
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
import { Command, CommandService } from '@theia/core/lib/common/command';
import { MenuPath } from '@theia/core/lib/common/menu';
import * as ReactDOM from 'react-dom';
import * as React from 'react';
import { PluginSharedStyle } from '../plugin-shared-style';
import { TreeViewActions } from './tree-view-actions';
import { TreeViewContextKeyService } from './tree-view-context-key-service';

export const TREE_NODE_HYPERLINK = 'theia-TreeNodeHyperlink';
export const VIEW_ITEM_CONTEXT_MENU: MenuPath = ['view-item-context-menu'];

export class TreeViewsMainImpl implements TreeViewsMain {

    private proxy: TreeViewsExt;

    /**
     * key: Tree View ID
     * value: TreeViewDataProviderMain
     */
    private dataProviders: Map<string, TreeViewDataProviderMain> = new Map<string, TreeViewDataProviderMain>();

    private treeViewWidgets: Map<string, TreeViewWidget> = new Map<string, TreeViewWidget>();

    private viewRegistry: ViewRegistry;

    private readonly contextKeys: TreeViewContextKeyService;
    private readonly sharedStyle: PluginSharedStyle;

    constructor(rpc: RPCProtocol, private container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.TREE_VIEWS_EXT);
        this.viewRegistry = container.get(ViewRegistry);

        this.contextKeys = this.container.get(TreeViewContextKeyService);
        this.sharedStyle = this.container.get(PluginSharedStyle);
    }

    $registerTreeDataProvider(treeViewId: string): void {
        const dataProvider = new TreeViewDataProviderMain(treeViewId, this.proxy, this.sharedStyle);
        this.dataProviders.set(treeViewId, dataProvider);

        const treeViewContainer = this.createTreeViewContainer(dataProvider);
        const treeViewWidget = treeViewContainer.get(TreeViewWidget);
        treeViewWidget.id = treeViewId;

        this.treeViewWidgets.set(treeViewId, treeViewWidget);

        this.viewRegistry.registerTreeView(treeViewId, treeViewWidget);

        this.handleTreeEvents(treeViewId, treeViewWidget);
    }

    $refresh(treeViewId: string): void {
        const treeViewWidget = this.treeViewWidgets.get(treeViewId);
        if (treeViewWidget) {
            treeViewWidget.model.refresh();
        }
    }

    // tslint:disable-next-line:no-any
    async $reveal(treeViewId: string, treeItemId: string): Promise<any> {
        const treeViewWidget = this.treeViewWidgets.get(treeViewId);
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
                const { id, contextValue } = event[0] as TreeViewNode;
                this.proxy.$setSelection(treeViewId, id, treeViewWidget.contextSelection);
                this.contextKeys.viewItem.set(contextValue);
            } else {
                this.contextKeys.viewItem.set('');
            }
            this.contextKeys.view.set(treeViewId);
        });
    }

}

export interface SelectionEventHandler {
    readonly node: SelectableTreeNode;
    readonly contextSelection: boolean;
}

export interface DescriptiveMetadata {
    // tslint:disable-next-line:no-any
    readonly metadata?: any
}

export interface TreeViewNode extends SelectableTreeNode, DescriptiveMetadata {
    contextValue?: string
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
            metadata: item.metadata,
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
            metadata: item.metadata,
            contextValue: item.contextValue
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

    @inject(TreeViewActions)
    protected readonly actions: TreeViewActions;

    @inject(CommandService)
    protected readonly commands: CommandService;

    @inject(TreeViewContextKeyService)
    protected readonly contextKeys: TreeViewContextKeyService;

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);

        setTimeout(() => {
            // Set root node
            const node = {
                id: '',
                parent: undefined,
                name: '',
                visible: false,
                expanded: true,
                selected: false,
                children: []
            };

            this.model.root = node;
        });
    }

    get contextSelection(): boolean {
        return this._contextSelection;
    }

    protected handleContextMenuEvent(node: TreeNode | undefined, event: React.MouseEvent<HTMLElement>): void {
        try {
            this._contextSelection = true;
            super.handleContextMenuEvent(node, event);
        } finally {
            this._contextSelection = false;
        }
    }

    public updateWidget() {
        this.updateRows();

        // Need to wait for 20 miliseconds until rows become updated.
        setTimeout(() => {
            ReactDOM.render(<React.Fragment>{this.render()}</React.Fragment>, this.node, () => this.onRender.dispose());
        }, 20);
    }

    renderIcon(node: TreeNode, props: NodeProps): React.ReactNode {
        if (node.icon) {
            return <div className={node.icon + ' tree-view-icon'}></div>;
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

    getCaption(node: TreeNode): React.ReactNode[] {
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
        const view = this.contextKeys.view.get();
        const viewItem = this.contextKeys.viewItem.get();
        this.contextKeys.view.set(this.id);
        this.contextKeys.viewItem.set(node.contextValue);
        try {
            const arg = node.metadata;
            return <React.Fragment>
                {this.actions.getInlineCommands(arg).map(command => this.renderInlineCommand(command, arg))}
            </React.Fragment>;
        } finally {
            this.contextKeys.view.set(view);
            this.contextKeys.viewItem.set(viewItem);
        }
    }

    // tslint:disable-next-line:no-any
    protected renderInlineCommand(command: Command, arg: any): React.ReactNode {
        if (!command.iconClass) {
            return false;
        }
        const className = [TREE_NODE_SEGMENT_CLASS, TREE_NODE_TAIL_CLASS, command.iconClass, 'theia-tree-view-inline-action'].join(' ');
        return <div key={command.id} className={className} title={command.label || ''} onClick={e => {
            e.stopPropagation();
            this.commands.executeCommand(command.id, arg);
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
