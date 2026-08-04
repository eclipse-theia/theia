// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import {
    TreeModelImpl,
    TreeWidget,
    CompositeTreeNode,
    TopDownTreeIterator,
    TreeNode,
    NodeProps,
    ExpandableTreeNode,
    SelectableTreeNode,
} from '@theia/core/lib/browser';
import { Emitter, PreferenceDataProperty, PreferenceSchemaService, PreferenceService } from '@theia/core';
import { PreferencesSearchbarWidget } from './views/preference-searchbar-widget';
import { PreferenceTreeGenerator } from './util/preference-tree-generator';
import * as fuzzy from '@theia/core/shared/fuzzy';
import { PreferencesScopeTabBar } from './views/preference-scope-tabbar-widget';
import { Preference } from './util/preference-types';
import { Event } from '@theia/core/lib/common';
import { COMMONLY_USED_SECTION_PREFIX } from './util/preference-layout';

export interface PreferenceTreeNodeProps extends NodeProps {
    visibleChildren: number;
    isExpansible?: boolean;
}

export interface PreferenceTreeNodeRow extends Readonly<TreeWidget.NodeRow>, PreferenceTreeNodeProps {
    node: Preference.TreeNode;
}
export enum PreferenceFilterChangeSource {
    Schema,
    Search,
    Scope,
    Category,
}
export interface PreferenceFilterChangeEvent {
    source: PreferenceFilterChangeSource
}

@injectable()
export class PreferenceTreeModel extends TreeModelImpl {

    @inject(PreferenceSchemaService) protected readonly schemaProvider: PreferenceSchemaService;
    @inject(PreferencesSearchbarWidget) protected readonly filterInput: PreferencesSearchbarWidget;
    @inject(PreferenceTreeGenerator) protected readonly treeGenerator: PreferenceTreeGenerator;
    @inject(PreferencesScopeTabBar) protected readonly scopeTracker: PreferencesScopeTabBar;
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService;

    protected readonly onTreeFilterChangedEmitter = new Emitter<PreferenceFilterChangeEvent>();
    readonly onFilterChanged = this.onTreeFilterChangedEmitter.event;

    protected lastSearchedFuzzy: string = '';
    protected lastSearchedLiteral: string = '';
    protected lastSearchedTags: string[] = [];
    protected _currentScope: number = Number(Preference.DEFAULT_SCOPE.scope);
    protected _isFiltered: boolean = false;
    protected _currentRows: Map<string, PreferenceTreeNodeRow> = new Map();
    protected _totalVisibleLeaves = 0;
    private _suppressSelection = false;
    protected _categoryFilterId: string | undefined;
    protected _initialSelectionApplied = false;

    get categoryFilterId(): string | undefined {
        return this._categoryFilterId;
    }

    get currentRows(): Readonly<Map<string, PreferenceTreeNodeRow>> {
        return this._currentRows;
    }

    get totalVisibleLeaves(): number {
        return this._totalVisibleLeaves;
    }

    get isFiltered(): boolean {
        return this._isFiltered;
    }

    get propertyList(): ReadonlyMap<string, PreferenceDataProperty> {
        return this.schemaProvider.getSchemaProperties();
    }

    get currentScope(): Preference.SelectedScopeDetails {
        return this.scopeTracker.currentScope;
    }

    get onSchemaChanged(): Event<CompositeTreeNode> {
        return this.treeGenerator.onSchemaChanged;
    }

    @postConstruct()
    protected override init(): void {
        this.doInit();
    }

    protected async doInit(): Promise<void> {
        super.init();
        this.toDispose.pushAll([
            this.onSelectionChanged(selectionEvent => {
                const node = selectionEvent[0];
                const newId = node ? this.categoryIdForSelection(node) : undefined;
                if (newId !== this._categoryFilterId) {
                    this._categoryFilterId = newId;
                    this.updateFilteredRows(PreferenceFilterChangeSource.Category);
                }
            }),
            this.treeGenerator.onSchemaChanged(newTree => this.handleNewSchema(newTree)),
            this.scopeTracker.onScopeChanged(scopeDetails => {
                this._currentScope = scopeDetails.scope;
                this.updateFilteredRows(PreferenceFilterChangeSource.Scope);
            }),
            this.filterInput.onFilterChanged(newSearchTerm => {
                this.lastSearchedTags = Array.from(newSearchTerm.matchAll(/@tag:([^\s]+)/g)).map(match => match[0].slice(5));
                const newSearchTermWithoutTags = newSearchTerm.replace(/@tag:[^\s]+/g, '');
                this.lastSearchedLiteral = newSearchTermWithoutTags;
                this.lastSearchedFuzzy = newSearchTermWithoutTags.replace(/\s/g, '');
                this._isFiltered = newSearchTerm.length > 2;
                if (this._isFiltered) {
                    this._categoryFilterId = undefined;
                }
                if (this.isFiltered) {
                    this.expandAll();
                } else if (CompositeTreeNode.is(this.root)) {
                    const root = this.root;
                    // Avoid intermediate selection events while collapsing.
                    this.withSuppressedSelection(() => this.collapseAll(root));
                }
                this.updateFilteredRows(PreferenceFilterChangeSource.Search);
            }),
            this.onFilterChanged(() => {
                this.filterInput.updateResultsCount(this._totalVisibleLeaves);
            }),
            this.onTreeFilterChangedEmitter,
        ]);
        await this.preferenceService.ready;
        this.handleNewSchema(this.treeGenerator.root);
    }

    private handleNewSchema(newRoot: CompositeTreeNode): void {
        this.root = newRoot;
        if (this._categoryFilterId && !this.getNode(this._categoryFilterId)) {
            this._categoryFilterId = undefined;
        }
        if (this.isFiltered) {
            this.expandAll();
        }
        this.updateFilteredRows(PreferenceFilterChangeSource.Schema);
        this.applyInitialSelection();
    }

    protected applyInitialSelection(): void {
        if (this._initialSelectionApplied) {
            return;
        }
        this._initialSelectionApplied = true;
        if (this.selectedNodes.length > 0) {
            return; // restoreState already selected something
        }
        if (!CompositeTreeNode.is(this.root)) {
            return;
        }
        const commonlyUsed = this.root.children.find(
            child => Preference.TreeNode.is(child) && child.id.startsWith(COMMONLY_USED_SECTION_PREFIX),
        );
        if (commonlyUsed && SelectableTreeNode.is(commonlyUsed)) {
            this.selectNode(commonlyUsed);
        }
    }

    protected updateRows(): void {
        const root = this.root;
        this._currentRows = new Map();
        if (root) {
            this._totalVisibleLeaves = 0;
            let index = 0;

            for (const node of new TopDownTreeIterator(root, {
                pruneCollapsed: false,
                pruneSiblings: true
            })) {
                if (TreeNode.isVisible(node) && Preference.TreeNode.is(node)) {
                    const { id } = Preference.TreeNode.getGroupAndIdFromNodeId(node.id);
                    if (CompositeTreeNode.is(node) || this.passesCurrentFilters(node, id)) {
                        this.updateVisibleChildren(node);

                        this._currentRows.set(node.id, {
                            index: index++,
                            node,
                            depth: node.depth,
                            visibleChildren: 0,
                        });
                    }
                }
            }
        }
    }

    protected updateFilteredRows(source: PreferenceFilterChangeSource): void {
        this.updateRows();
        this.onTreeFilterChangedEmitter.fire({ source });
    }

    protected passesCurrentFilters(node: Preference.LeafNode, prefID: string): boolean {
        if (!this.schemaProvider.isValidInScope(prefID, this._currentScope)) {
            return false;
        }
        if (!this._isFiltered) {
            return true;
        }
        // When filtering, VSCode will render an item that is present in the commonly used section only once but render both its possible parents in the left-hand tree.
        // E.g. searching for editor.renderWhitespace will show one item in the main panel, but both 'Commonly Used' and 'Text Editor' in the left tree.
        // That seems counterintuitive and introduces a number of special cases, so I prefer to remove the commonly used section entirely when the user searches.
        if (node.id.startsWith(COMMONLY_USED_SECTION_PREFIX)) {
            return false;
        }
        if (!this.lastSearchedTags.every(tag => node.preference.data.tags?.includes(tag))) {
            return false;
        }
        return fuzzy.test(this.lastSearchedFuzzy, prefID) // search matches preference name.
            // search matches description. Fuzzy isn't ideal here because the score depends on the order of discovery.
            || (node.preference.data.description ?? '').includes(this.lastSearchedLiteral);
    }

    protected override isVisibleSelectableNode(node: TreeNode): node is SelectableTreeNode {
        return CompositeTreeNode.is(node) && !!this._currentRows.get(node.id)?.visibleChildren;
    }

    protected updateVisibleChildren(node: TreeNode): void {
        if (!CompositeTreeNode.is(node)) {
            this._totalVisibleLeaves++;
            let nextParent = node.parent?.id && this._currentRows.get(node.parent?.id);
            while (nextParent && nextParent.node !== this.root) {
                if (nextParent) {
                    nextParent.visibleChildren += 1;
                }
                nextParent = nextParent.node.parent?.id && this._currentRows.get(nextParent.node.parent?.id);
                if (nextParent) {
                    nextParent.isExpansible = true;
                }
            }
        }
    }

    collapseAllExcept(openNode: TreeNode | undefined): void {
        const openNodes: TreeNode[] = [];
        while (ExpandableTreeNode.is(openNode)) {
            openNodes.push(openNode);
            this.expandNode(openNode);
            openNode = openNode.parent;
        }
        if (CompositeTreeNode.is(this.root)) {
            this.root.children.forEach(child => {
                if (!openNodes.includes(child) && ExpandableTreeNode.is(child)) {
                    this.collapseNode(child);
                }
            });
        }
    }

    protected expandAll(): void {
        if (CompositeTreeNode.is(this.root)) {
            this.root.children.forEach(child => {
                if (ExpandableTreeNode.is(child)) {
                    this.expandNode(child);
                }
            });
        }
    }

    override selectNode(node: Readonly<SelectableTreeNode>): void {
        if (!this._suppressSelection) {
            super.selectNode(node);
        }
    }

    protected withSuppressedSelection(fn: () => void): void {
        this._suppressSelection = true;
        try {
            fn();
        } finally {
            this._suppressSelection = false;
        }
    }

    getNodeFromPreferenceId(id: string): Preference.TreeNode | undefined {
        const node = this.getNode(this.treeGenerator.getNodeId(id));
        return node && Preference.TreeNode.is(node) ? node : undefined;
    }

    /**
     * @returns `true` if any ancestor of `node` has id `categoryId`. The check is
     * **strict** — `node === category` returns `false`. Callers that should treat the
     * selected category itself as "inside" must check `node.id === categoryId` first.
     */
    isDescendantOfCategory(node: TreeNode, categoryId: string): boolean {
        let current: TreeNode | undefined = node.parent;
        while (current) {
            if (current.id === categoryId) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }

    /**
     * @returns `true` if `node` is a strict composite ancestor of the category with id
     * `categoryId` — i.e. the category itself sits somewhere in `node`'s subtree.
     * Used to keep parent category headers visible above the selected category.
     */
    isCompositeAncestorOfCategory(node: TreeNode, categoryId: string): boolean {
        if (!CompositeTreeNode.is(node) || node.id === categoryId) {
            return false;
        }
        const category = this.getNode(categoryId);
        return !!category && this.isDescendantOfCategory(category, node.id);
    }

    /**
     * Returns the id of the nearest composite (category) ancestor of `node`,
     * inclusive of `node` itself. Returns `undefined` if no category ancestor is found.
     */
    protected categoryIdForSelection(node: TreeNode): string | undefined {
        let current: TreeNode | undefined = node;
        while (current) {
            if (Preference.TreeNode.is(current) && Preference.CompositeTreeNode.is(current)) {
                return current.id;
            }
            current = current.parent;
        }
        return undefined;
    }

    /**
     * @returns true if selection changed, false otherwise
     */
    selectIfNotSelected(node: SelectableTreeNode): boolean {
        const currentlySelected = this.selectedNodes[0];
        if (!node.selected || node !== currentlySelected) {
            node.selected = true;
            this.selectNode(node);
            return true;
        }
        return false;
    }
}
