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

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
    TreeDataProvider, TreeView, TreeViewExpansionEvent, TreeItem2, TreeItemLabel,
    TreeViewSelectionChangeEvent, TreeViewVisibilityChangeEvent
} from '@theia/plugin';
// TODO: extract `@theia/util` for event, disposable, cancellation and common types
// don't use @theia/core directly from plugin host
import { Emitter } from '@theia/core/lib/common/event';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { Disposable as PluginDisposable, ThemeIcon } from '../types-impl';
import { Plugin, PLUGIN_RPC_CONTEXT, TreeViewsExt, TreeViewsMain, TreeViewItem, TreeViewRevealOptions } from '../../common/plugin-api-rpc';
import { RPCProtocol } from '../../common/rpc-protocol';
import { CommandRegistryImpl, CommandsConverter } from '../command-registry';
import { TreeViewSelection } from '../../common';
import { PluginIconPath } from '../plugin-icon-path';

export class TreeViewsExtImpl implements TreeViewsExt {

    private proxy: TreeViewsMain;

    private readonly treeViews = new Map<string, TreeViewExtImpl<any>>();

    constructor(rpc: RPCProtocol, readonly commandRegistry: CommandRegistryImpl) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.TREE_VIEWS_MAIN);
        commandRegistry.registerArgumentProcessor({
            processArgument: arg => {
                if (!TreeViewSelection.is(arg)) {
                    return arg;
                }
                const { treeViewId, treeItemId } = arg;
                const treeView = this.treeViews.get(treeViewId);
                return treeView && treeView.getTreeItem(treeItemId);
            }
        });
    }

    registerTreeDataProvider<T>(plugin: Plugin, treeViewId: string, treeDataProvider: TreeDataProvider<T>): PluginDisposable {
        const treeView = this.createTreeView(plugin, treeViewId, { treeDataProvider });

        return PluginDisposable.create(() => {
            this.treeViews.delete(treeViewId);
            treeView.dispose();
        });
    }

    createTreeView<T>(plugin: Plugin, treeViewId: string, options: { treeDataProvider: TreeDataProvider<T> }): TreeView<T> {
        if (!options || !options.treeDataProvider) {
            throw new Error('Options with treeDataProvider is mandatory');
        }

        const treeView = new TreeViewExtImpl(plugin, treeViewId, options.treeDataProvider, this.proxy, this.commandRegistry.converter);
        this.treeViews.set(treeViewId, treeView);

        return {
            // tslint:disable:typedef
            get onDidExpandElement() {
                return treeView.onDidExpandElement;
            },
            get onDidCollapseElement() {
                return treeView.onDidCollapseElement;
            },
            get selection() {
                return treeView.selectedElements;
            },
            get onDidChangeSelection() {
                return treeView.onDidChangeSelection;
            },
            get visible() {
                return treeView.visible;
            },
            get onDidChangeVisibility() {
                return treeView.onDidChangeVisibility;
            },
            get message(): string {
                return treeView.message;
            },
            set message(message: string) {
                treeView.message = message;
            },
            get title(): string {
                return treeView.title;
            },
            set title(title: string) {
                treeView.title = title;
            },
            reveal: (element: T, revealOptions?: Partial<TreeViewRevealOptions>): Thenable<void> =>
                treeView.reveal(element, revealOptions),

            dispose: () => {
                this.treeViews.delete(treeViewId);
                treeView.dispose();
            }
        };
    }

    async $getChildren(treeViewId: string, treeItemId: string): Promise<TreeViewItem[] | undefined> {
        const treeView = this.getTreeView(treeViewId);

        return treeView.getChildren(treeItemId);
    }

    async $setExpanded(treeViewId: string, treeItemId: string, expanded: boolean): Promise<any> {
        const treeView = this.getTreeView(treeViewId);

        if (expanded) {
            return treeView.onExpanded(treeItemId);
        } else {
            return treeView.onCollapsed(treeItemId);
        }
    }

    async $setSelection(treeViewId: string, treeItemIds: string[]): Promise<void> {
        this.getTreeView(treeViewId).setSelection(treeItemIds);
    }

    async $setVisible(treeViewId: string, isVisible: boolean): Promise<void> {
        this.getTreeView(treeViewId).setVisible(isVisible);
    }

    protected getTreeView(treeViewId: string): TreeViewExtImpl<any> {
        const treeView = this.treeViews.get(treeViewId);
        if (!treeView) {
            throw new Error(`No tree view with id '${treeViewId}' registered.`);
        }
        return treeView;
    }

}

interface TreeExtNode<T> extends Disposable {
    id: string
    value?: T
    children?: TreeExtNode<T>[]
}

class TreeViewExtImpl<T> implements Disposable {

    private readonly onDidExpandElementEmitter = new Emitter<TreeViewExpansionEvent<T>>();
    readonly onDidExpandElement = this.onDidExpandElementEmitter.event;

    private readonly onDidCollapseElementEmitter = new Emitter<TreeViewExpansionEvent<T>>();
    readonly onDidCollapseElement = this.onDidCollapseElementEmitter.event;

    private readonly onDidChangeSelectionEmitter = new Emitter<TreeViewSelectionChangeEvent<T>>();
    readonly onDidChangeSelection = this.onDidChangeSelectionEmitter.event;

    private readonly onDidChangeVisibilityEmitter = new Emitter<TreeViewVisibilityChangeEvent>();
    readonly onDidChangeVisibility = this.onDidChangeVisibilityEmitter.event;

    private readonly nodes = new Map<string, TreeExtNode<T>>();
    private pendingRefresh = Promise.resolve();

    private readonly toDispose = new DisposableCollection(
        Disposable.create(() => this.clearAll()),
        this.onDidExpandElementEmitter,
        this.onDidCollapseElementEmitter,
        this.onDidChangeSelectionEmitter,
        this.onDidChangeVisibilityEmitter
    );

    constructor(
        private plugin: Plugin,
        private treeViewId: string,
        private treeDataProvider: TreeDataProvider<T>,
        private proxy: TreeViewsMain,
        readonly commandsConverter: CommandsConverter) {

        proxy.$registerTreeDataProvider(treeViewId);
        this.toDispose.push(Disposable.create(() => this.proxy.$unregisterTreeDataProvider(treeViewId)));

        if (treeDataProvider.onDidChangeTreeData) {
            treeDataProvider.onDidChangeTreeData((e: T) => {
                this.pendingRefresh = proxy.$refresh(treeViewId);
            });
        }
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    async reveal(element: T, options?: Partial<TreeViewRevealOptions>): Promise<void> {
        await this.pendingRefresh;

        let elementId;
        this.nodes.forEach((el, id) => {
            if (Object.is(el.value, element)) {
                elementId = id;
            }
        });

        if (elementId) {
            return this.proxy.$reveal(this.treeViewId, elementId, {
                select: true, focus: false, expand: false, ...options
            });
        }
    }

    private _message: string = '';
    get message(): string {
        return this._message;
    }

    set message(message: string) {
        this._message = message;
        this.proxy.$setMessage(this.treeViewId, this._message);
    }

    private _title: string = '';
    get title(): string {
        return this._title;
    }

    set title(title: string) {
        this._title = title;
        this.proxy.$setTitle(this.treeViewId, title);
    }

    getTreeItem(treeItemId: string): T | undefined {
        const element = this.nodes.get(treeItemId);
        return element && element.value;
    }

    async getChildren(parentId: string): Promise<TreeViewItem[] | undefined> {
        const parentNode = this.nodes.get(parentId);
        const parent = parentNode && parentNode.value;
        if (parentId && !parent) {
            console.error(`No tree item with id '${parentId}' found.`);
            return [];
        }
        this.clearChildren(parentNode);

        // ask data provider for children for cached element
        const result = await this.treeDataProvider.getChildren(parent);
        if (result) {
            const treeItems: TreeViewItem[] = [];
            const promises = result.map(async (value, index) => {

                // Ask data provider for a tree item for the value
                // Data provider must return theia.TreeItem
                const treeItem: TreeItem2 = await this.treeDataProvider.getTreeItem(value);
                // Convert theia.TreeItem to the TreeViewItem

                // Take a label
                let label: string | undefined;
                const treeItemLabel: string | TreeItemLabel | undefined = treeItem.label;
                if (typeof treeItemLabel === 'object' && typeof treeItemLabel.label === 'string') {
                    label = treeItemLabel.label;
                } else {
                    label = treeItem.label;
                }

                let idLabel = label;
                // Use resource URI if label is not set
                if (idLabel === undefined && treeItem.resourceUri) {
                    idLabel = treeItem.resourceUri.path.toString();
                    idLabel = decodeURIComponent(idLabel);
                    if (idLabel.indexOf('/') >= 0) {
                        idLabel = idLabel.substring(idLabel.lastIndexOf('/') + 1);
                    }
                }

                // Generate the ID
                // ID is used for caching the element
                const id = treeItem.id || `${parentId}/${index}:${idLabel}`;

                const toDisposeElement = new DisposableCollection();
                const node: TreeExtNode<T> = {
                    id,
                    value,
                    dispose: () => toDisposeElement.dispose()
                };
                if (parentNode) {
                    const children = parentNode.children || [];
                    children.push(node);
                    parentNode.children = children;
                }
                this.nodes.set(id, node);

                let icon;
                let iconUrl;
                let themeIconId;
                const { iconPath } = treeItem;
                if (typeof iconPath === 'string' && iconPath.indexOf('fa-') !== -1) {
                    icon = iconPath;
                } else if (iconPath instanceof ThemeIcon) {
                    themeIconId = iconPath.id;
                } else {
                    iconUrl = PluginIconPath.toUrl(<PluginIconPath | undefined>iconPath, this.plugin);
                }

                const treeViewItem = {
                    id,
                    label,
                    icon,
                    iconUrl,
                    themeIconId,
                    description: treeItem.description,
                    resourceUri: treeItem.resourceUri,
                    tooltip: treeItem.tooltip,
                    collapsibleState: treeItem.collapsibleState,
                    contextValue: treeItem.contextValue,
                    command: this.commandsConverter.toSafeCommand(treeItem.command, toDisposeElement)
                } as TreeViewItem;

                treeItems.push(treeViewItem);
            });

            await Promise.all(promises);
            return treeItems;
        } else {
            return undefined;
        }
    }

    private clearChildren(parentNode?: TreeExtNode<T>): void {
        if (parentNode) {
            if (parentNode.children) {
                for (const child of parentNode.children) {
                    this.clear(child);
                }
            }
            delete parentNode['children'];
        } else {
            this.clearAll();
        }
    }

    private clear(node: TreeExtNode<T>): void {
        if (node.children) {
            for (const child of node.children) {
                this.clear(child);
            }
        }
        this.nodes.delete(node.id);
        node.dispose();
    }

    private clearAll(): void {
        this.nodes.forEach(node => node.dispose());
        this.nodes.clear();
    }

    async onExpanded(treeItemId: string): Promise<any> {
        // get element from a cache
        const cachedElement = this.getTreeItem(treeItemId);

        // fire an event
        if (cachedElement) {
            this.onDidExpandElementEmitter.fire({
                element: cachedElement
            });
        }
    }

    async onCollapsed(treeItemId: string): Promise<any> {
        // get element from a cache
        const cachedElement = this.getTreeItem(treeItemId);

        // fire an event
        if (cachedElement) {
            this.onDidCollapseElementEmitter.fire({
                element: cachedElement
            });
        }
    }

    private selectedItemIds = new Set<string>();
    get selectedElements(): T[] {
        const items: T[] = [];
        for (const id of this.selectedItemIds) {
            const item = this.getTreeItem(id);
            if (item) {
                items.push(item);
            }
        }
        return items;
    }

    setSelection(selectedItemIds: string[]): void {
        const toDelete = new Set<string>(this.selectedItemIds);
        for (const id of this.selectedItemIds) {
            toDelete.delete(id);
            if (!this.selectedItemIds.has(id)) {
                this.doSetSelection(selectedItemIds);
                return;
            }
        }
        if (toDelete.size) {
            this.doSetSelection(selectedItemIds);
        }
    }
    protected doSetSelection(selectedItemIts: string[]): void {
        this.selectedItemIds = new Set(selectedItemIts);
        this.onDidChangeSelectionEmitter.fire(Object.freeze({ selection: this.selectedElements }));
    }

    private _visible = false;
    get visible(): boolean {
        return this._visible;
    }

    setVisible(visible: boolean): void {
        if (visible !== this._visible) {
            this._visible = visible;
            this.onDidChangeVisibilityEmitter.fire(Object.freeze({ visible: this._visible }));
        }
    }

}
