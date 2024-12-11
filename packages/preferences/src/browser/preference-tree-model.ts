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
    PreferenceSchemaProvider,
    PreferenceDataProperty,
    NodeProps,
    ExpandableTreeNode,
    SelectableTreeNode,
    PreferenceService,
} from '@theia/core/lib/browser';
import { Emitter } from '@theia/core';
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
}
export interface PreferenceFilterChangeEvent {
    source: PreferenceFilterChangeSource
}

@injectable()
export class PreferenceTreeModel extends TreeModelImpl {

    @inject(PreferenceSchemaProvider) protected readonly schemaProvider: PreferenceSchemaProvider;
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

    get currentRows(): Readonly<Map<string, PreferenceTreeNodeRow>> {
        return this._currentRows;
    }

    get totalVisibleLeaves(): number {
        return this._totalVisibleLeaves;
    }

    get isFiltered(): boolean {
        return this._isFiltered;
    }

    get propertyList(): { [key: string]: PreferenceDataProperty; } {
        return this.schemaProvider.getCombinedSchema().properties;
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
                if (this.isFiltered) {
                    this.expandAll();
                } else if (CompositeTreeNode.is(this.root)) {
                    this.collapseAll(this.root);
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
        if (this.isFiltered) {
            this.expandAll();
        }
        this.updateFilteredRows(PreferenceFilterChangeSource.Schema);
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

    getNodeFromPreferenceId(id: string): Preference.TreeNode | undefined {
        const node = this.getNode(this.treeGenerator.getNodeId(id));
        return node && Preference.TreeNode.is(node) ? node : undefined;
    }

    /**
     * @returns true if selection changed, false otherwise
     */
    selectIfNotSelected(node: SelectableTreeNode): boolean {
        const currentlySelected = this.selectedNodes[0];
        if (node !== currentlySelected) {
            this.selectNode(node);
            return true;
        }
        return false;
    }
}
