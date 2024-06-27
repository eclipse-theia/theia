// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
    TreeDataProvider, TreeView, TreeViewExpansionEvent, TreeItem, TreeItemLabel,
    TreeViewSelectionChangeEvent, TreeViewVisibilityChangeEvent, CancellationToken, DataTransferFile, TreeViewOptions, ViewBadge, TreeCheckboxChangeEvent
} from '@theia/plugin';
// TODO: extract `@theia/util` for event, disposable, cancellation and common types
// don't use @theia/core directly from plugin host
import { Emitter } from '@theia/core/lib/common/event';
import { basename } from '@theia/core/lib/common/paths';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { DataTransfer, DataTransferItem, Disposable as PluginDisposable, ThemeIcon, TreeItemCheckboxState } from '../types-impl';
import { Plugin, PLUGIN_RPC_CONTEXT, TreeViewsExt, TreeViewsMain, TreeViewItem, TreeViewRevealOptions, DataTransferFileDTO } from '../../common/plugin-api-rpc';
import { RPCProtocol } from '../../common/rpc-protocol';
import { CommandRegistryImpl, CommandsConverter } from '../command-registry';
import { TreeViewItemReference } from '../../common';
import { PluginIconPath } from '../plugin-icon-path';
import { URI } from '@theia/core/shared/vscode-uri';
import { UriComponents } from '@theia/core/lib/common/uri';
import { isObject } from '@theia/core';
import { coalesce } from '../../common/arrays';

export class TreeViewsExtImpl implements TreeViewsExt {
    private proxy: TreeViewsMain;

    private readonly treeViews = new Map<string, TreeViewExtImpl<any>>();

    constructor(rpc: RPCProtocol, readonly commandRegistry: CommandRegistryImpl) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.TREE_VIEWS_MAIN);

        commandRegistry.registerArgumentProcessor({
            processArgument: arg => {
                if (TreeViewItemReference.is(arg)) {
                    return this.toTreeElement(arg);
                } else if (Array.isArray(arg)) {
                    return arg.map(param => TreeViewItemReference.is(param) ? this.toTreeElement(param) : param);
                } else {
                    return arg;
                }
            }
        });
    }
    $checkStateChanged(treeViewId: string, itemIds: { id: string; checked: boolean; }[]): Promise<void> {
        return this.getTreeView(treeViewId).checkStateChanged(itemIds);
    }
    $dragStarted(treeViewId: string, treeItemIds: string[], token: CancellationToken): Promise<UriComponents[] | undefined> {
        return this.getTreeView(treeViewId).onDragStarted(treeItemIds, token);
    }

    $dragEnd(treeViewId: string): Promise<void> {
        return this.getTreeView(treeViewId).dragEnd();
    }

    $drop(treeViewId: string, treeItemId: string | undefined, dataTransferItems: [string, string | DataTransferFileDTO][], token: CancellationToken): Promise<void> {
        return this.getTreeView(treeViewId).handleDrop!(treeItemId, dataTransferItems, token);
    }

    protected toTreeElement(treeViewItemRef: TreeViewItemReference): any {
        return this.treeViews.get(treeViewItemRef.viewId)?.getElement(treeViewItemRef.itemId);
    }

    registerTreeDataProvider<T>(plugin: Plugin, treeViewId: string, treeDataProvider: TreeDataProvider<T>): PluginDisposable {
        const treeView = this.createTreeView(plugin, treeViewId, { treeDataProvider });

        return PluginDisposable.create(() => {
            this.treeViews.delete(treeViewId);
            treeView.dispose();
        });
    }

    createTreeView<T>(plugin: Plugin, treeViewId: string, options: TreeViewOptions<T>): TreeView<T> {
        if (!options || !options.treeDataProvider) {
            throw new Error('Options with treeDataProvider is mandatory');
        }

        const treeView = new TreeViewExtImpl<T>(plugin, treeViewId, options, this.proxy, this.commandRegistry.converter);
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
            get onDidChangeCheckboxState() {
                return treeView.onDidChangeCheckboxState;
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
            get description(): string {
                return treeView.description;
            },
            set description(description: string) {
                treeView.description = description;
            },
            get badge(): ViewBadge | undefined {
                return treeView.badge;
            },
            set badge(badge: ViewBadge | undefined) {
                treeView.badge = badge;
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

    async $resolveTreeItem(treeViewId: string, treeItemId: string, token: CancellationToken): Promise<TreeViewItem | undefined> {
        return this.getTreeView(treeViewId).resolveTreeItem(treeItemId, token);
    }

    async $hasResolveTreeItem(treeViewId: string): Promise<boolean> {
        return this.getTreeView(treeViewId).hasResolveTreeItem();
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
    /** Collection of disposables. Must be disposed by an instance's `dispose` implementation. */
    disposables: DisposableCollection;
    /** The original `TreeItem` provided by the plugin's tree data provider. */
    pluginTreeItem?: TreeItem;
    /** The `TreeViewItem` used on the main side to render the tree node. */
    treeViewItem?: TreeViewItem;
    value?: T
    children?: TreeExtNode<T>[]
}

class TreeViewExtImpl<T> implements Disposable {
    private static readonly ID_COMPUTED = 'c';
    private static readonly ID_ITEM = 'i';

    private readonly onDidExpandElementEmitter = new Emitter<TreeViewExpansionEvent<T>>();
    readonly onDidExpandElement = this.onDidExpandElementEmitter.event;

    private readonly onDidCollapseElementEmitter = new Emitter<TreeViewExpansionEvent<T>>();
    readonly onDidCollapseElement = this.onDidCollapseElementEmitter.event;

    private readonly onDidChangeSelectionEmitter = new Emitter<TreeViewSelectionChangeEvent<T>>();
    readonly onDidChangeSelection = this.onDidChangeSelectionEmitter.event;

    private readonly onDidChangeVisibilityEmitter = new Emitter<TreeViewVisibilityChangeEvent>();
    readonly onDidChangeVisibility = this.onDidChangeVisibilityEmitter.event;

    private readonly onDidChangeCheckboxStateEmitter = new Emitter<TreeCheckboxChangeEvent<T>>();
    readonly onDidChangeCheckboxState = this.onDidChangeCheckboxStateEmitter.event;

    private readonly nodes = new Map<string, TreeExtNode<T>>();
    private pendingRefresh = Promise.resolve();

    private localDataTransfer = new DataTransfer();

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
        private options: TreeViewOptions<T>,
        private proxy: TreeViewsMain,
        readonly commandsConverter: CommandsConverter
    ) {
        // make copies of optionally provided MIME types:
        const dragMimeTypes = options.dragAndDropController?.dragMimeTypes?.slice();
        const dropMimeTypes = options.dragAndDropController?.dropMimeTypes?.slice();
        proxy.$registerTreeDataProvider(treeViewId, {
            manageCheckboxStateManually: options.manageCheckboxStateManually,
            showCollapseAll: options.showCollapseAll,
            canSelectMany: options.canSelectMany,
            dragMimeTypes, dropMimeTypes
        });
        this.toDispose.push(Disposable.create(() => this.proxy.$unregisterTreeDataProvider(treeViewId)));
        options.treeDataProvider.onDidChangeTreeData?.(() => {
            this.pendingRefresh = proxy.$refresh(treeViewId);
        });
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    async reveal(element: T, options?: Partial<TreeViewRevealOptions>): Promise<void> {
        await this.pendingRefresh;
        const select = options?.select !== false; // default to true
        const focus = !!options?.focus;
        const expand = typeof options?.expand === 'undefined' ? false : options!.expand;

        const elementParentChain = await this.calculateRevealParentChain(element);
        if (elementParentChain) {
            return this.proxy.$reveal(this.treeViewId, elementParentChain, {
                select, focus, expand, ...options
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

    private _description: string = '';
    get description(): string {
        return this._description;
    }

    set description(description: string) {
        this._description = description;
        this.proxy.$setDescription(this.treeViewId, this._description);
    }

    private _badge?: ViewBadge = undefined;
    get badge(): ViewBadge | undefined {
        return this._badge;
    }
    set badge(badge: ViewBadge | undefined) {
        this._badge = badge;
        this.proxy.$setBadge(this.treeViewId, badge ? { value: badge.value, tooltip: badge.tooltip } : undefined);
    }

    getElement(treeItemId: string): T | undefined {
        return this.nodes.get(treeItemId)?.value;
    }

    /**
     * calculate the chain of node ids from root to element so that the frontend can expand all of them and reveal element.
     * this is needed as the frontend may not have the full tree nodes.
     * throughout the parent chain this.getChildren is called in order to fill this.nodes cache.
     *
     * returns undefined if wasn't able to calculate the path due to inconsistencies.
     *
     * @param element element to reveal
     */
    private async calculateRevealParentChain(element: T | undefined): Promise<string[]> {
        if (!element) {
            // root
            return [];
        }
        const parent = await this.options.treeDataProvider.getParent?.(element) ?? undefined;
        const chain = await this.calculateRevealParentChain(parent);
        const parentId = chain.length ? chain[chain.length - 1] : '';
        const treeItem = await this.options.treeDataProvider.getTreeItem(element);
        return chain.concat(this.buildTreeItemId(parentId, treeItem, false));
    }

    private getTreeItemLabel(treeItem: TreeItem): string | undefined {
        const treeItemLabel: string | TreeItemLabel | undefined = treeItem.label;
        return typeof treeItemLabel === 'object' ? treeItemLabel.label : treeItemLabel;
    }

    private getTreeItemLabelHighlights(treeItem: TreeItem): [number, number][] | undefined {
        const treeItemLabel: string | TreeItemLabel | undefined = treeItem.label;
        return typeof treeItemLabel === 'object' ? treeItemLabel.highlights : undefined;
    }

    private getItemLabel(treeItem: TreeItem): string | undefined {
        let idLabel = this.getTreeItemLabel(treeItem);
        // Use resource URI if label is not set
        if (idLabel === undefined && treeItem.resourceUri) {
            idLabel = treeItem.resourceUri.path.toString();
            idLabel = decodeURIComponent(idLabel);
            if (idLabel.indexOf('/') >= 0) {
                idLabel = idLabel.substring(idLabel.lastIndexOf('/') + 1);
            }
        }
        return idLabel;
    }

    // Modeled on https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/common/extHostTreeViews.ts#L822
    private buildTreeItemId(parentId: string, item: TreeItem, mustReturnNew: boolean): string {
        if (item.id) {
            return `${TreeViewExtImpl.ID_ITEM}-@-${parentId}-@-${item.id}`;
        }

        const treeItemLabel = this.getItemLabel(item);
        const prefix: string = `${TreeViewExtImpl.ID_COMPUTED}-@-${parentId || ''}-@-`;
        let elementId = treeItemLabel ? treeItemLabel : item.resourceUri ? basename(item.resourceUri.fsPath) : '';
        elementId = elementId.indexOf('/') !== -1 ? elementId.replace('/', '//') : elementId;
        const childrenNodes = (this.nodes.get(parentId)?.children || []);

        let id: string;
        let counter = 0;
        do {
            id = `${prefix}/${counter}:${elementId}`;
            if (!mustReturnNew || !this.nodes.has(id) || this.nodes.get(id) === item) {
                // Return first if asked for or
                // Return if handle does not exist or
                // Return if handle is being reused
                break;
            }
            counter++;
        } while (counter <= childrenNodes.length);

        return id;
    }

    async getChildren(parentId: string): Promise<TreeViewItem[] | undefined> {
        let parentNode = this.nodes.get(parentId);
        const parent = parentNode?.value;
        if (parentId && !parent) {
            console.error(`No tree item with id '${parentId}' found.`);
            return [];
        }
        this.clearChildren(parentNode);

        // place root in the cache
        if (parentId === '' && !parentNode) {
            const rootNodeDisposables = new DisposableCollection();
            parentNode = { id: '', disposables: rootNodeDisposables, dispose: () => { rootNodeDisposables.dispose(); } };
            this.nodes.set(parentId, parentNode);
        }
        // ask data provider for children for cached element
        const result = await this.options.treeDataProvider.getChildren(parent);
        if (result) {
            const treeItemPromises = coalesce(result).map(async value => {

                // Ask data provider for a tree item for the value
                // Data provider must return theia.TreeItem
                const treeItem = await this.options.treeDataProvider.getTreeItem(value);
                // Convert theia.TreeItem to the TreeViewItem

                const label = this.getItemLabel(treeItem) || '';
                const highlights = this.getTreeItemLabelHighlights(treeItem);

                // Generate the ID
                // ID is used for caching the element
                const id = this.buildTreeItemId(parentId, treeItem, true);

                const toDisposeElement = new DisposableCollection();
                const node: TreeExtNode<T> = {
                    id,
                    pluginTreeItem: treeItem,
                    value,
                    disposables: toDisposeElement,
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
                let themeIcon;
                const { iconPath } = treeItem;
                if (typeof iconPath === 'string' && iconPath.indexOf('fa-') !== -1) {
                    icon = iconPath;
                } else if (ThemeIcon.is(iconPath)) {
                    themeIcon = iconPath;
                } else {
                    iconUrl = PluginIconPath.toUrl(iconPath, this.plugin);
                }

                let checkboxInfo;
                if (treeItem.checkboxState === undefined) {
                    checkboxInfo = undefined;
                } else if (isObject(treeItem.checkboxState)) {
                    checkboxInfo = {
                        checked: treeItem.checkboxState.state === TreeItemCheckboxState.Checked,
                        tooltip: treeItem.checkboxState.tooltip,
                        accessibilityInformation: treeItem.accessibilityInformation
                    };
                } else {
                    checkboxInfo = {
                        checked: treeItem.checkboxState === TreeItemCheckboxState.Checked
                    };
                }

                const treeViewItem: TreeViewItem = {
                    id,
                    label,
                    highlights,
                    icon,
                    iconUrl,
                    themeIcon,
                    description: treeItem.description,
                    resourceUri: treeItem.resourceUri,
                    tooltip: treeItem.tooltip,
                    collapsibleState: treeItem.collapsibleState?.valueOf(),
                    checkboxInfo: checkboxInfo,
                    contextValue: treeItem.contextValue,
                    command: this.commandsConverter.toSafeCommand(treeItem.command, toDisposeElement),
                    accessibilityInformation: treeItem.accessibilityInformation
                };
                node.treeViewItem = treeViewItem;

                return treeViewItem;
            });

            return Promise.all(treeItemPromises);
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
        const cachedElement = this.getElement(treeItemId);

        // fire an event
        if (cachedElement) {
            this.onDidExpandElementEmitter.fire({
                element: cachedElement
            });
        }
    }

    async onCollapsed(treeItemId: string): Promise<any> {
        // get element from a cache
        const cachedElement = this.getElement(treeItemId);

        // fire an event
        if (cachedElement) {
            this.onDidCollapseElementEmitter.fire({
                element: cachedElement
            });
        }
    }

    async checkStateChanged(items: readonly { id: string; checked: boolean; }[]): Promise<void> {
        const transformed: [T, TreeItemCheckboxState][] = [];
        items.forEach(item => {
            const node = this.nodes.get(item.id);
            if (node) {
                if (node.value) {
                    transformed.push([node.value, item.checked ? TreeItemCheckboxState.Checked : TreeItemCheckboxState.Unchecked]);
                }
                if (node.treeViewItem) {
                    node.treeViewItem.checkboxInfo!.checked = item.checked;
                }
            }
        });

        this.onDidChangeCheckboxStateEmitter.fire({
            items: transformed
        });
    }

    async resolveTreeItem(treeItemId: string, token: CancellationToken): Promise<TreeViewItem | undefined> {
        if (!this.options.treeDataProvider.resolveTreeItem) {
            return undefined;
        }

        const node = this.nodes.get(treeItemId);
        if (node && node.treeViewItem && node.pluginTreeItem && node.value) {
            const resolved = await this.options.treeDataProvider.resolveTreeItem(node.pluginTreeItem, node.value, token) ?? node.pluginTreeItem;
            node.treeViewItem.command = this.commandsConverter.toSafeCommand(resolved.command, node.disposables);
            node.treeViewItem.tooltip = resolved.tooltip;
            return node.treeViewItem;
        }

        return undefined;
    }

    hasResolveTreeItem(): boolean {
        return !!this.options.treeDataProvider.resolveTreeItem;
    }

    private selectedItemIds = new Set<string>();
    get selectedElements(): T[] {
        const items: T[] = [];
        for (const id of this.selectedItemIds) {
            const item = this.getElement(id);
            if (item) {
                items.push(item);
            }
        }
        return items;
    }

    setSelection(selectedItemIds: string[]): void {
        const toDelete = new Set<string>(this.selectedItemIds);
        for (const id of selectedItemIds) {
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

    async onDragStarted(treeItemIds: string[], token: CancellationToken): Promise<UriComponents[] | undefined> {
        const treeItems: T[] = [];
        for (const id of treeItemIds) {
            const item = this.getElement(id);
            if (item) {
                treeItems.push(item);
            }
        }
        if (this.options.dragAndDropController?.handleDrag) {
            this.localDataTransfer.clear();
            await this.options.dragAndDropController.handleDrag(treeItems, this.localDataTransfer, token);
            const uriList = await this.localDataTransfer.get('text/uri-list')?.asString();
            if (uriList) {
                return uriList.split('\n').map(str => URI.parse(str));
            }
        }
        return undefined;
    }

    async dragEnd(): Promise<void> {
        this.localDataTransfer.clear();
    }

    async handleDrop(treeItemId: string | undefined, dataTransferItems: [string, string | DataTransferFileDTO][], token: CancellationToken): Promise<void> {
        const treeItem = treeItemId ? this.getElement(treeItemId) : undefined;
        const dropTransfer = new DataTransfer();
        if (this.options.dragAndDropController?.handleDrop) {
            this.localDataTransfer.forEach((item, type) => {
                dropTransfer.set(type, item);
            });
            for (const [type, item] of dataTransferItems) {
                // prefer the item the plugin has set in `onDragStarted`;
                if (!dropTransfer.has(type)) {
                    if (typeof item === 'string') {
                        dropTransfer.set(type, new DataTransferItem(item));
                    } else {
                        const file: DataTransferFile = {
                            name: item.name,
                            data: () => this.proxy.$readDroppedFile(item.contentId).then(buffer => buffer.buffer),
                            uri: item.uri ? URI.revive(item.uri) : undefined
                        };

                        const fileItem = new class extends DataTransferItem {
                            override asFile(): DataTransferFile | undefined {
                                return file;
                            }
                        }(file);

                        dropTransfer.set(type, fileItem);
                    }
                }
            }
            return this.options.dragAndDropController.handleDrop(treeItem, dropTransfer, token);
        }
    }
}
