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

import { interfaces } from '@theia/core/shared/inversify';
import { MAIN_RPC_CONTEXT, TreeViewsMain, TreeViewsExt, TreeViewRevealOptions } from '../../../common/plugin-api-rpc';
import { RPCProtocol } from '../../../common/rpc-protocol';
import { PluginViewRegistry, PLUGIN_VIEW_DATA_FACTORY_ID } from './plugin-view-registry';
import {
    SelectableTreeNode,
    ExpandableTreeNode,
    CompositeTreeNode,
    WidgetManager
} from '@theia/core/lib/browser';
import { ViewContextKeyService } from './view-context-key-service';
import { Disposable, DisposableCollection } from '@theia/core';
import { TreeViewWidget, TreeViewNode, PluginTreeModel } from './tree-view-widget';
import { PluginViewWidget } from './plugin-view-widget';

export class TreeViewsMainImpl implements TreeViewsMain, Disposable {

    private readonly proxy: TreeViewsExt;
    private readonly viewRegistry: PluginViewRegistry;
    private readonly contextKeys: ViewContextKeyService;
    private readonly widgetManager: WidgetManager;

    private readonly treeViewProviders = new Map<string, Disposable>();

    private readonly toDispose = new DisposableCollection(
        Disposable.create(() => { /* mark as not disposed */ })
    );

    constructor(rpc: RPCProtocol, private container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.TREE_VIEWS_EXT);
        this.viewRegistry = container.get(PluginViewRegistry);

        this.contextKeys = this.container.get(ViewContextKeyService);
        this.widgetManager = this.container.get(WidgetManager);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    async $registerTreeDataProvider(treeViewId: string): Promise<void> {
        this.treeViewProviders.set(treeViewId, this.viewRegistry.registerViewDataProvider(treeViewId, async ({ state, viewInfo }) => {
            const widget = await this.widgetManager.getOrCreateWidget<TreeViewWidget>(PLUGIN_VIEW_DATA_FACTORY_ID, { id: treeViewId });
            widget.model.viewInfo = viewInfo;
            if (state) {
                widget.restoreState(state);
                // ensure that state is completely restored
                await widget.model.refresh();
            } else if (!widget.model.root) {
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
            if (this.toDispose.disposed) {
                widget.model.proxy = undefined;
            } else {
                widget.model.proxy = this.proxy;
                this.toDispose.push(Disposable.create(() => widget.model.proxy = undefined));
                this.handleTreeEvents(widget.id, widget);
            }
            await widget.model.refresh();
            return widget;
        }));
        this.toDispose.push(Disposable.create(() => this.$unregisterTreeDataProvider(treeViewId)));
    }

    async $unregisterTreeDataProvider(treeViewId: string): Promise<void> {
        const treeDataProvider = this.treeViewProviders.get(treeViewId);
        if (treeDataProvider) {
            this.treeViewProviders.delete(treeViewId);
            treeDataProvider.dispose();
        }
    }

    async $refresh(treeViewId: string): Promise<void> {
        const viewPanel = await this.viewRegistry.getView(treeViewId);
        const widget = viewPanel && viewPanel.widgets[0];
        if (widget instanceof TreeViewWidget) {
            await widget.model.refresh();
        }
    }

    // elementParentChain parameter contain a list of tree ids from root to the revealed node
    // all parents of the revealed node should be fetched and expanded in order for it to reveal
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async $reveal(treeViewId: string, elementParentChain: string[], options: TreeViewRevealOptions): Promise<any> {
        const viewPanel = await this.viewRegistry.openView(treeViewId, { activate: options.focus, reveal: true });
        const widget = viewPanel && viewPanel.widgets[0];
        if (widget instanceof TreeViewWidget) {
            // pop last element which is the node to reveal
            const elementId = elementParentChain.pop();
            await this.expandParentChain(widget.model, elementParentChain);
            const treeNode = widget.model.getNode(elementId);
            if (treeNode) {
                if (options.expand && ExpandableTreeNode.is(treeNode)) {
                    await widget.model.expandNode(treeNode);
                }
                if (options.select && SelectableTreeNode.is(treeNode)) {
                    widget.model.selectNode(treeNode);
                }
            }
        }
    }

    /**
     * Expand all parents of the node to reveal from root. This should also fetch missing nodes to the frontend.
     */
    private async expandParentChain(model: PluginTreeModel, elementParentChain: string[]): Promise<void> {
        for (const elementId of elementParentChain) {
            const treeNode = model.getNode(elementId);
            if (ExpandableTreeNode.is(treeNode)) {
                await model.expandNode(treeNode);
            }
        }
    }

    async $setMessage(treeViewId: string, message: string): Promise<void> {
        const viewPanel = await this.viewRegistry.getView(treeViewId);
        if (viewPanel instanceof PluginViewWidget) {
            viewPanel.message = message;
        }
    }

    async $setTitle(treeViewId: string, title: string): Promise<void> {
        const viewPanel = await this.viewRegistry.getView(treeViewId);
        if (viewPanel) {
            viewPanel.title.label = title;
        }
    }

    protected handleTreeEvents(treeViewId: string, treeViewWidget: TreeViewWidget): void {
        this.toDispose.push(treeViewWidget.model.onExpansionChanged(event => {
            this.proxy.$setExpanded(treeViewId, event.id, event.expanded);
        }));

        this.toDispose.push(treeViewWidget.model.onSelectionChanged(event => {
            if (event.length === 1) {
                const { contextValue } = event[0] as TreeViewNode;
                this.contextKeys.viewItem.set(contextValue);
            } else {
                this.contextKeys.viewItem.set('');
            }
            this.contextKeys.view.set(treeViewId);

            this.proxy.$setSelection(treeViewId, event.map((node: TreeViewNode) => node.id));
        }));

        const updateVisible = () => this.proxy.$setVisible(treeViewId, treeViewWidget.isVisible);
        updateVisible();
        this.toDispose.push(treeViewWidget.onDidChangeVisibility(() => updateVisible()));
    }

}
