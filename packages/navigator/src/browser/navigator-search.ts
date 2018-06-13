/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, postConstruct } from 'inversify';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { Tree, TreeNode } from '@theia/core/lib/browser/tree/tree';
import { TreeDecorator, TreeDecoration } from '@theia/core/lib/browser/tree/tree-decorator';
import { TopDownTreeIterator } from '@theia/core/lib/browser';
import { FuzzySearch } from './fuzzy-search';

@injectable()
export class FileNavigatorSearch implements Disposable, TreeDecorator {

    readonly id = 'theia-navigator-search-decorator';

    @inject(FuzzySearch)
    protected readonly fuzzySearch: FuzzySearch;

    protected readonly disposables = new DisposableCollection();
    protected readonly decorationEmitter = new Emitter<(tree: Tree) => Map<string, TreeDecoration.Data>>();

    protected _filteredNodeIds: ReadonlyArray<Readonly<string>> = [];

    @postConstruct()
    init() {
        this.disposables.push(this.decorationEmitter);
    }

    /**
     * Returns with a function, that resolves to all the visible tree nodes that match the search pattern
     * for the given tree.
     */
    filter(pattern: string | undefined): (tree: Tree) => Promise<ReadonlyArray<string>> {
        return (async (tree: Tree) => {
            const { root } = tree;
            if (!pattern || !root) {
                this.fireDidChangeDecorations((t: Tree) => new Map());
                this._filteredNodeIds = [];
                return [];
            }
            const items = [...new TopDownTreeIterator(root, { pruneCollapsed: true })];
            const transform = (node: TreeNode) => node.name;
            const result = await this.fuzzySearch.filter({
                items,
                pattern,
                transform
            });
            this.fireDidChangeDecorations((t: Tree) => new Map(result.map(m => [m.item.id, this.toDecorator(m)] as [string, TreeDecoration.Data])));
            this._filteredNodeIds = result.map(match => match.item.id);
            return this._filteredNodeIds!.slice();
        }).bind(this);
    }

    get onDidChangeDecorations(): Event<(tree: Tree) => Map<string, TreeDecoration.Data>> {
        return this.decorationEmitter.event;
    }

    /**
     * Returns with the IDs of all the filtered tree nodes after invoking the `filter` method.
     */
    get filteredNodes(): ReadonlyArray<string> {
        return this._filteredNodeIds.slice();
    }

    dispose() {
        this.disposables.dispose();
    }

    protected fireDidChangeDecorations(event: (tree: Tree) => Map<string, TreeDecoration.Data>): void {
        this.decorationEmitter.fire(event);
    }

    protected toDecorator(match: FuzzySearch.Match<TreeNode>): TreeDecoration.Data {
        return {
            highlight: {
                ranges: match.ranges.map(this.mapRange.bind(this))
            }
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
