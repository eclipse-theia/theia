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
import { RPCProtocol } from '@theia/plugin-ext/src/api/rpc-protocol';
import { ViewRegistry } from './view-registry';
import { Message } from '@phosphor/messaging';

import {
    TreeWidget,
    ContextMenuRenderer,
    TreeModel,
    TreeNode,
    NodeProps,
    TreeProps,
    createTreeContainer,
    SelectableTreeNode,
    ExpandableTreeNode,
    CompositeTreeNode,
    TreeImpl,
    Tree
} from '@theia/core/lib/browser';

import { TreeViewItem, TreeViewItemCollapsibleState } from '../../../api/plugin-api';

import * as ReactDOM from 'react-dom';
import * as React from 'react';

export class TreeViewsMainImpl implements TreeViewsMain {

    private proxy: TreeViewsExt;

    /**
     * key: Tree View ID
     * value: TreeViewDataProviderMain
     */
    private dataProviders: Map<string, TreeViewDataProviderMain> = new Map<string, TreeViewDataProviderMain>();

    private treeViewWidgets: Map<string, TreeViewWidget> = new Map<string, TreeViewWidget>();

    private viewRegistry: ViewRegistry;

    constructor(rpc: RPCProtocol, private container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.TREE_VIEWS_EXT);
        this.viewRegistry = container.get(ViewRegistry);
    }

    $registerTreeDataProvider(treeViewId: string): void {
        const dataProvider = new TreeViewDataProviderMain(treeViewId, this.proxy);
        this.dataProviders.set(treeViewId, dataProvider);

        const treeViewContainer = this.createTreeViewContainer(dataProvider);
        const treeViewWidget = treeViewContainer.get(TreeViewWidget);

        this.treeViewWidgets.set(treeViewId, treeViewWidget);

        this.viewRegistry.onRegisterTreeView(treeViewId, treeViewWidget);

        this.handleTreeEvents(treeViewId, treeViewWidget);
    }

    $refresh(treeViewId: string): void {
        const treeViewWidget = this.treeViewWidgets.get(treeViewId);
        if (treeViewWidget) {
            treeViewWidget.model.refresh();
        }
    }

    $reveal(treeViewId: string): void {
    }

    createTreeViewContainer(dataProvider: TreeViewDataProviderMain): Container {
        const child = createTreeContainer(this.container);

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
                this.proxy.$setSelection(treeViewId, event[0].id);
            }
        });
    }

}

export interface TreeViewFolderNode extends SelectableTreeNode, ExpandableTreeNode, CompositeTreeNode {
}

export interface TreeViewFileNode extends SelectableTreeNode {
}

export class TreeViewDataProviderMain {

    constructor(private treeViewId: string, private proxy: TreeViewsExt) {
    }

    createFolderNode(item: TreeViewItem): TreeViewFolderNode {
        let expanded = false;
        if (TreeViewItemCollapsibleState.Expanded === item.collapsibleState) {
            expanded = true;
        }

        return {
            id: item.id,
            parent: undefined,
            name: item.label,
            icon: item.icon,
            description: item.tooltip,
            visible: true,
            selected: false,
            expanded,
            children: []
        };
    }

    createFileNode(item: TreeViewItem): TreeViewFileNode {
        return {
            id: item.id,
            name: item.label,
            icon: item.icon,
            description: item.tooltip,
            parent: undefined,
            visible: true,
            selected: false,
        };
    }

    /**
     * Creates TreeNode
     *
     * @param item tree view item from the ext
     */
    createTreeNode(item: TreeViewItem): TreeNode {
        if ('collapsibleState' in item) {
            if (TreeViewItemCollapsibleState.Expanded === item.collapsibleState) {
                return this.createFolderNode(item);
            } else if (TreeViewItemCollapsibleState.Collapsed === item.collapsibleState) {
                return this.createFolderNode(item);
            }
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

    constructor(
        @inject(TreeProps) readonly treeProps: TreeProps,
        @inject(TreeModel) readonly model: TreeModel,
        @inject(ContextMenuRenderer) readonly contextMenuRenderer: ContextMenuRenderer,
        @inject(TreeViewDataProviderMain) readonly dataProvider: TreeViewDataProviderMain) {

        super(treeProps, model, contextMenuRenderer);
    }

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

    public updateWidget() {
        this.updateRows();

        // Need to wait for 20 miliseconds until rows become updated.
        setTimeout(() => {
            ReactDOM.render(<React.Fragment>{this.render()}</React.Fragment>, this.node, () => this.onRender.dispose());
        }, 20);
    }

    renderIcon(node: TreeNode, props: NodeProps): React.ReactNode {
        if (node.icon) {
            return <div className={'fa ' + node.icon + ' tree-view-icon'}></div>;
        }

        return undefined;
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
