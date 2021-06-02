/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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
    ExpandableTreeNode
} from '@theia/core/lib/browser';
import { Emitter } from '@theia/core';
import { PreferencesSearchbarWidget } from './views/preference-searchbar-widget';
import { PreferenceTreeGenerator } from './util/preference-tree-generator';
import * as fuzzy from '@theia/core/shared/fuzzy';
import { PreferencesScopeTabBar } from './views/preference-scope-tabbar-widget';
import { Preference } from './util/preference-types';
import { Event } from '@theia/core/src/common';

export interface PreferenceTreeNodeRow extends TreeWidget.NodeRow {
    visibleChildren: number;
    isExpansible?: boolean;
}
export interface PreferenceTreeNodeProps extends NodeProps {
    visibleChildren: number;
    isExpansible?: boolean;
}

@injectable()
export class PreferenceTreeModel extends TreeModelImpl {

    @inject(PreferenceSchemaProvider) protected readonly schemaProvider: PreferenceSchemaProvider;
    @inject(PreferencesSearchbarWidget) protected readonly filterInput: PreferencesSearchbarWidget;
    @inject(PreferenceTreeGenerator) protected readonly treeGenerator: PreferenceTreeGenerator;
    @inject(PreferencesScopeTabBar) protected readonly scopeTracker: PreferencesScopeTabBar;

    protected readonly onTreeFilterChangedEmitter = new Emitter<{ filterCleared: boolean; rows: Map<string, PreferenceTreeNodeRow>; }>();
    readonly onFilterChanged = this.onTreeFilterChangedEmitter.event;

    protected lastSearchedFuzzy: string = '';
    protected lastSearchedLiteral: string = '';
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
    protected init(): void {
        super.init();
        this.toDispose.pushAll([
            this.treeGenerator.onSchemaChanged(newTree => {
                this.root = newTree;
                this.updateFilteredRows();
            }),
            this.scopeTracker.onScopeChanged(scopeDetails => {
                this._currentScope = Number(scopeDetails.scope);
                this.updateFilteredRows();
            }),
            this.filterInput.onFilterChanged(newSearchTerm => {
                this.lastSearchedLiteral = newSearchTerm;
                this.lastSearchedFuzzy = newSearchTerm.replace(/\s/g, '');
                const wasFiltered = this._isFiltered;
                this._isFiltered = newSearchTerm.length > 2;
                this.updateFilteredRows(wasFiltered && !this._isFiltered);
            }),
            this.onFilterChanged(() => {
                this.filterInput.updateResultsCount(this._totalVisibleLeaves);
            }),
            this.onTreeFilterChangedEmitter,
        ]);
    }

    protected updateRows(): void {
        const root = this.root;
        this._currentRows = new Map();
        if (root) {
            this._totalVisibleLeaves = 0;
            const depths = new Map<CompositeTreeNode | undefined, number>();
            let index = 0;

            for (const node of new TopDownTreeIterator(root, {
                pruneCollapsed: false,
                pruneSiblings: true
            })) {
                if (TreeNode.isVisible(node)) {
                    if (CompositeTreeNode.is(node) || this.passesCurrentFilters(node.id)) {
                        const depth = this.getDepthForNode(depths, node);

                        this.updateVisibleChildren(node);

                        this._currentRows.set(node.id, {
                            index: index++,
                            node,
                            depth,
                            visibleChildren: 0,
                        });
                    }
                }
            }
        }
    }

    protected updateFilteredRows(filterWasCleared: boolean = false): void {
        this.updateRows();
        this.onTreeFilterChangedEmitter.fire({ filterCleared: filterWasCleared, rows: this._currentRows });
    }

    protected passesCurrentFilters(nodeID: string): boolean {
        const currentNodeShouldBeVisible = this.schemaProvider.isValidInScope(nodeID, this._currentScope)
            && (
                !this._isFiltered // search too short.
                || fuzzy.test(this.lastSearchedFuzzy, nodeID || '') // search matches preference name.
                // search matches description. Fuzzy isn't ideal here because the score depends on the order of discovery.
                || (this.schemaProvider.getCombinedSchema().properties[nodeID].description || '').includes(this.lastSearchedLiteral)
            );

        return currentNodeShouldBeVisible;
    }

    protected getDepthForNode(depths: Map<CompositeTreeNode | undefined, number>, node: TreeNode): number {
        const parentDepth = depths.get(node.parent);
        const depth = parentDepth === undefined ? 0 : TreeNode.isVisible(node.parent) ? parentDepth + 1 : parentDepth;
        if (CompositeTreeNode.is(node)) {
            depths.set(node, depth);
        }
        return depth;
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

    collapseAllExcept(openNode: ExpandableTreeNode | undefined): void {
        this.expandNode(openNode);
        const children = (this.root as CompositeTreeNode).children as ExpandableTreeNode[];
        children.forEach(child => {
            if (child !== openNode && child.expanded) {
                this.collapseNode(child);
            }
        });
    }
}
