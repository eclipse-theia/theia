/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { inject, injectable, postConstruct } from 'inversify';
import { Disposable, DisposableCollection } from '../../common/disposable';
import { Event, Emitter } from '../../common/event';
import { Tree, TreeNode } from './tree';
import { TreeDecoration } from './tree-decorator';
import { FuzzySearch } from './fuzzy-search';
import { TopDownTreeIterator } from './tree-iterator';

@injectable()
export class TreeSearch implements Disposable {

    @inject(Tree)
    protected readonly tree: Tree;

    @inject(FuzzySearch)
    protected readonly fuzzySearch: FuzzySearch;

    protected readonly disposables = new DisposableCollection();
    protected readonly filteredNodesEmitter = new Emitter<ReadonlyArray<Readonly<TreeNode>>>();

    protected _filterResult: FuzzySearch.Match<TreeNode>[] = [];
    protected _filteredNodes: ReadonlyArray<Readonly<TreeNode>> = [];

    @postConstruct()
    init() {
        this.disposables.push(this.filteredNodesEmitter);
    }

    getHighlights(): Map<string, TreeDecoration.CaptionHighlight> {
        return new Map(this._filterResult.map(m => [m.item.id, this.toCaptionHighlight(m)] as [string, TreeDecoration.CaptionHighlight]));
    }

    /**
     * Resolves to all the visible tree nodes that match the search pattern.
     */
    async filter(pattern: string | undefined): Promise<ReadonlyArray<Readonly<TreeNode>>> {
        const { root } = this.tree;
        if (!pattern || !root) {
            this._filterResult = [];
            this._filteredNodes = [];
            this.fireFilteredNodesChanged(this._filteredNodes);
            return [];
        }
        const items = [...new TopDownTreeIterator(root, { pruneCollapsed: true })];
        const transform = (node: TreeNode) => node.name;
        this._filterResult = await this.fuzzySearch.filter({
            items,
            pattern,
            transform
        });
        this._filteredNodes = this._filterResult.map(match => match.item);
        this.fireFilteredNodesChanged(this._filteredNodes);
        return this._filteredNodes!.slice();
    }

    /**
     * Returns with the filtered nodes after invoking the `filter` method.
     */
    get filteredNodes(): ReadonlyArray<Readonly<TreeNode>> {
        return this._filteredNodes.slice();
    }

    /**
     * Event that is fired when the filtered nodes have been changed.
     */
    get onFilteredNodesChanged(): Event<ReadonlyArray<Readonly<TreeNode>>> {
        return this.filteredNodesEmitter.event;
    }

    dispose() {
        this.disposables.dispose();
    }

    protected fireFilteredNodesChanged(nodes: ReadonlyArray<Readonly<TreeNode>>): void {
        this.filteredNodesEmitter.fire(nodes);
    }

    protected toCaptionHighlight(match: FuzzySearch.Match<TreeNode>): TreeDecoration.CaptionHighlight {
        return {
            ranges: match.ranges.map(this.mapRange.bind(this))
        };
    }

    protected mapRange(range: FuzzySearch.Range): TreeDecoration.CaptionHighlight.Range {
        const { offset, length } = range;
        return {
            offset,
            length
        };
    }

}
