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

// tslint:disable:no-any

import { TreeDataProvider, TreeView, TreeViewExpansionEvent, TreeItem } from '@theia/plugin';
import { Emitter } from '@theia/core/lib/common/event';
import { Disposable } from '../types-impl';
import { PLUGIN_RPC_CONTEXT, TreeViewsExt, TreeViewsMain, TreeViewItem } from '../../api/plugin-api';
import { RPCProtocol } from '../../api/rpc-protocol';
import { CommandRegistryImpl } from '../command-registry';

export class TreeViewsExtImpl implements TreeViewsExt {

    private proxy: TreeViewsMain;

    private treeViews: Map<string, TreeViewExtImpl<any>> = new Map<string, TreeViewExtImpl<any>>();

    constructor(rpc: RPCProtocol, private commandRegistry: CommandRegistryImpl) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.TREE_VIEWS_MAIN);
    }

    registerTreeDataProvider<T>(treeViewId: string, treeDataProvider: TreeDataProvider<T>): Disposable {
        const treeView = this.createTreeView(treeViewId, { treeDataProvider });

        return Disposable.create(() => {
            this.treeViews.delete(treeViewId);
            treeView.dispose();
        });
    }

    createTreeView<T>(treeViewId: string, options: { treeDataProvider: TreeDataProvider<T> }): TreeView<T> {
        if (!options || !options.treeDataProvider) {
            throw new Error('Options with treeDataProvider is mandatory');
        }

        const treeView = new TreeViewExtImpl(treeViewId, options.treeDataProvider, this.proxy, this.commandRegistry);
        this.treeViews.set(treeViewId, treeView);

        return {
            get onDidExpandElement() {
                return treeView.onDidExpandElement;
            },

            get onDidCollapseElement() {
                return treeView.onDidCollapseElement;
            },

            get selection() {
                return treeView.selectedElements;
            },

            reveal: (element: T, selectionOptions: { select?: boolean }): Thenable<void> =>
                treeView.reveal(element, selectionOptions),

            dispose: () => {
                this.treeViews.delete(treeViewId);
                treeView.dispose();
            }
        };
    }

    async $getChildren(treeViewId: string, treeItemId: string): Promise<TreeViewItem[] | undefined> {
        const treeView = this.treeViews.get(treeViewId);
        if (!treeView) {
            throw new Error('No tree view with id' + treeViewId);
        }

        return treeView.getChildren(treeItemId);
    }

    async $setExpanded(treeViewId: string, treeItemId: string, expanded: boolean): Promise<any> {
        const treeView = this.treeViews.get(treeViewId);
        if (!treeView) {
            throw new Error('No tree view with id' + treeViewId);
        }

        if (expanded) {
            return treeView.onExpanded(treeItemId);
        } else {
            return treeView.onCollapsed(treeItemId);
        }
    }

    async $setSelection(treeViewId: string, treeItemId: string): Promise<any> {
        const treeView = this.treeViews.get(treeViewId);
        if (!treeView) {
            throw new Error('No tree view with id' + treeViewId);
        }

        treeView.onSelectionChanged(treeItemId);
    }

}

class TreeViewExtImpl<T> extends Disposable {

    private onDidExpandElementEmmiter: Emitter<TreeViewExpansionEvent<T>> = new Emitter<TreeViewExpansionEvent<T>>();
    public readonly onDidExpandElement = this.onDidExpandElementEmmiter.event;

    private onDidCollapseElementEmmiter: Emitter<TreeViewExpansionEvent<T>> = new Emitter<TreeViewExpansionEvent<T>>();
    public readonly onDidCollapseElement = this.onDidCollapseElementEmmiter.event;

    private selection: T[] = [];
    get selectedElements(): T[] { return this.selection; }

    private cache: Map<string, T> = new Map<string, T>();

    private idCounter: number = 0;

    constructor(
        private treeViewId: string,
        private treeDataProvider: TreeDataProvider<T>,
        private proxy: TreeViewsMain,
        private commandRegistry: CommandRegistryImpl) {

        super(() => {
            this.dispose();
        });

        proxy.$registerTreeDataProvider(treeViewId);

        if (treeDataProvider.onDidChangeTreeData) {
            treeDataProvider.onDidChangeTreeData((e: T) => {
                proxy.$refresh(treeViewId);
            });
        }
    }

    dispose() {
    }

    async reveal(element: T, selectionOptions?: { select?: boolean }): Promise<void> {
        // find element id in a cache
        let elementId;
        this.cache.forEach((el, id) => {
            if (Object.is(el, element)) {
                elementId = id;
            }
        });

        if (elementId) {
            return this.proxy.$reveal(this.treeViewId, elementId);
        }
    }

    /** Note, the generated ID must include the item's `contextValue`. */
    generateId(item: TreeItem): string {
        return `item-${this.idCounter++}/${item.contextValue || ''}`;
    }

    async getChildren(treeItemId: string): Promise<TreeViewItem[] | undefined> {
        // get element from a cache
        const cachedElement: T | undefined = this.cache.get(treeItemId);

        // ask data provider for children for cached element
        const result = await this.treeDataProvider.getChildren(cachedElement);

        if (result) {
            const treeItems: TreeViewItem[] = [];
            const promises = result.map(async value => {

                // Ask data provider for a tree item for the value
                // Data provider must return theia.TreeItem
                const treeItem = await this.treeDataProvider.getTreeItem(value);

                // Generate the ID
                // ID is used for caching the element
                const id = this.generateId(treeItem);

                // Add element to the cache
                this.cache.set(id, value);

                // Convert theia.TreeItem to the TreeViewItem

                // Take a label
                let label = treeItem.label;

                // Use resource URI if label is not set
                if (!label && treeItem.resourceUri) {
                    label = treeItem.resourceUri.path.toString();
                    label = decodeURIComponent(label);
                    if (label.indexOf('/') >= 0) {
                        label = label.substring(label.lastIndexOf('/') + 1);
                    }
                }

                // Use item ID if item label is still not set
                if (!label) {
                    label = id;
                }

                // Take the icon
                // currently only icons from font-awesome are supported
                let icon = undefined;
                if (typeof treeItem.iconPath === 'string') {
                    icon = treeItem.iconPath;
                }

                const treeViewItem = {
                    id,
                    label: label,
                    icon,
                    tooltip: treeItem.tooltip,
                    collapsibleState: treeItem.collapsibleState
                } as TreeViewItem;

                treeItems.push(treeViewItem);
            });

            await Promise.all(promises);
            return treeItems;
        } else {
            return undefined;
        }
    }

    async onExpanded(treeItemId: string): Promise<any> {
        // get element from a cache
        const cachedElement: T | undefined = this.cache.get(treeItemId);

        // fire an event
        if (cachedElement) {
            this.onDidExpandElementEmmiter.fire({
                element: cachedElement
            });
        }
    }

    async onCollapsed(treeItemId: string): Promise<any> {
        // get element from a cache
        const cachedElement: T | undefined = this.cache.get(treeItemId);

        // fire an event
        if (cachedElement) {
            this.onDidCollapseElementEmmiter.fire({
                element: cachedElement
            });
        }
    }

    async onSelectionChanged(treeItemId: string): Promise<any> {
        // get element from a cache
        const cachedElement: T | undefined = this.cache.get(treeItemId);

        if (cachedElement) {
            this.selection = [cachedElement];

            // Ask data provider for a tree item for the value
            const treeItem = await this.treeDataProvider.getTreeItem(cachedElement);

            if (treeItem.command) {
                this.commandRegistry.executeCommand(treeItem.command.id, treeItem.command.arguments ?
                    treeItem.command.arguments : []);
            }
        }
    }

}
