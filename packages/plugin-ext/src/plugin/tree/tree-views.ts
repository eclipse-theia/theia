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

import * as path from 'path';
import URI from 'vscode-uri';
import { TreeDataProvider, TreeView, TreeViewExpansionEvent, TreeItem2, TreeItemLabel } from '@theia/plugin';
import { Emitter } from '@theia/core/lib/common/event';
import { Disposable, ThemeIcon } from '../types-impl';
import { Plugin, PLUGIN_RPC_CONTEXT, TreeViewsExt, TreeViewsMain, TreeViewItem } from '../../common/plugin-api-rpc';
import { RPCProtocol } from '../../common/rpc-protocol';
import { CommandRegistryImpl, CommandsConverter } from '../command-registry';
import { TreeViewSelection } from '../../common';
import { PluginPackage } from '../../common/plugin-protocol';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { toInternalCommand } from '../type-converters';

export class TreeViewsExtImpl implements TreeViewsExt {

    private proxy: TreeViewsMain;

    private treeViews: Map<string, TreeViewExtImpl<any>> = new Map<string, TreeViewExtImpl<any>>();

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

    registerTreeDataProvider<T>(plugin: Plugin, treeViewId: string, treeDataProvider: TreeDataProvider<T>): Disposable {
        const treeView = this.createTreeView(plugin, treeViewId, { treeDataProvider });

        return Disposable.create(() => {
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
            // tslint:disable-next-line:typedef
            get onDidExpandElement() {
                return treeView.onDidExpandElement;
            },
            // tslint:disable-next-line:typedef
            get onDidCollapseElement() {
                return treeView.onDidCollapseElement;
            },
            // tslint:disable-next-line:typedef
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

}

class TreeViewExtImpl<T> extends Disposable {

    private onDidExpandElementEmitter: Emitter<TreeViewExpansionEvent<T>> = new Emitter<TreeViewExpansionEvent<T>>();
    public readonly onDidExpandElement = this.onDidExpandElementEmitter.event;

    private onDidCollapseElementEmitter: Emitter<TreeViewExpansionEvent<T>> = new Emitter<TreeViewExpansionEvent<T>>();
    public readonly onDidCollapseElement = this.onDidCollapseElementEmitter.event;

    private disposables = new DisposableCollection();

    private selection: T[] = [];
    get selectedElements(): T[] { return this.selection; }

    private cache: Map<string, T> = new Map<string, T>();

    constructor(
        private plugin: Plugin,
        private treeViewId: string,
        private treeDataProvider: TreeDataProvider<T>,
        private proxy: TreeViewsMain,
        readonly commandsConverter: CommandsConverter) {

        super(() => {
            proxy.$unregisterTreeDataProvider(treeViewId);
        });

        proxy.$registerTreeDataProvider(treeViewId);

        if (treeDataProvider.onDidChangeTreeData) {
            treeDataProvider.onDidChangeTreeData((e: T) => {
                proxy.$refresh(treeViewId);
            });
        }
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

    getTreeItem(treeItemId: string): T | undefined {
        return this.cache.get(treeItemId);
    }

    async getChildren(parentId: string): Promise<TreeViewItem[] | undefined> {
        // get element from a cache
        const parent = this.getTreeItem(parentId);
        if (parentId && !parent) {
            console.error(`No tree item with id '${parentId}' found.`);
            return [];
        }
        this.disposables.dispose();

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

                // Use resource URI if label is not set
                if (!label && treeItem.resourceUri) {
                    label = treeItem.resourceUri.path.toString();
                    label = decodeURIComponent(label);
                    if (label.indexOf('/') >= 0) {
                        label = label.substring(label.lastIndexOf('/') + 1);
                    }
                }

                // Generate the ID
                // ID is used for caching the element
                const id = treeItem.id || `${parentId}/${index}:${label}`;

                // Use item ID if item label is still not set
                if (!label) {
                    label = treeItem.id;
                }

                // Add element to the cache
                this.cache.set(id, value);

                let icon;
                let iconUrl;
                let themeIconId;
                const { iconPath } = treeItem;
                if (iconPath) {
                    const toUrl = (arg: string | URI) => {
                        arg = arg instanceof URI && arg.scheme === 'file' ? arg.fsPath : arg;
                        if (typeof arg !== 'string') {
                            return arg.toString(true);
                        }
                        const { packagePath } = this.plugin.rawModel;
                        const absolutePath = path.isAbsolute(arg) ? arg : path.join(packagePath, arg);
                        const normalizedPath = path.normalize(absolutePath);
                        const relativePath = path.relative(packagePath, normalizedPath);
                        return PluginPackage.toPluginUrl(this.plugin.rawModel, relativePath);
                    };
                    if (typeof iconPath === 'string' && iconPath.indexOf('fa-') !== -1) {
                        icon = iconPath;
                    } else if (iconPath instanceof ThemeIcon) {
                        themeIconId = iconPath.id;
                    } else if (typeof iconPath === 'string' || iconPath instanceof URI) {
                        iconUrl = toUrl(iconPath);
                    } else {
                        const { light, dark } = iconPath as { light: string | URI, dark: string | URI };
                        iconUrl = {
                            light: toUrl(light),
                            dark: toUrl(dark)
                        };
                    }
                }

                const treeViewItem = {
                    id,
                    label,
                    icon,
                    iconUrl,
                    themeIconId,
                    resourceUri: treeItem.resourceUri,
                    tooltip: treeItem.tooltip,
                    collapsibleState: treeItem.collapsibleState,
                    contextValue: treeItem.contextValue,
                    command: treeItem.command ? toInternalCommand(this.commandsConverter.toSafeCommand(treeItem.command, this.disposables)) : undefined
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

}
