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

import { interfaces } from 'inversify';
import { MAIN_RPC_CONTEXT, TreeViewsMain, TreeViewsExt } from '../../../api/plugin-api';
import { RPCProtocol } from '../../../api/rpc-protocol';
import { PluginViewRegistry, PLUGIN_VIEW_DATA_FACTORY_ID } from './plugin-view-registry';
import { SelectableTreeNode, ExpandableTreeNode, CompositeTreeNode, WidgetManager } from '@theia/core/lib/browser';
import { ViewContextKeyService } from './view-context-key-service';
import { CommandRegistry, Disposable } from '@theia/core';
import { TreeViewWidget, TreeViewNode } from './tree-view-widget';

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
        this.treeViewProviders.set(treeViewId, this.viewRegistry.registerViewDataProvider(treeViewId, async ({ state, viewInfo }) => {
            const widget = await this.widgetManager.getOrCreateWidget<TreeViewWidget>(PLUGIN_VIEW_DATA_FACTORY_ID, { id: treeViewId });
            widget.model.viewInfo = viewInfo;
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
