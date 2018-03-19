/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, postConstruct } from 'inversify';
import { Tree, TreeNode } from './tree';
import { Event, Emitter } from '../../common';
import { TreeSelectionState } from './tree-selection-state';
import { TreeSelectionService, SelectableTreeNode, TreeSelection } from './tree-selection';

@injectable()
export class TreeSelectionServiceImpl implements TreeSelectionService {

    @inject(Tree)
    protected readonly tree: Tree;
    protected readonly onSelectionChangedEmitter = new Emitter<ReadonlyArray<Readonly<SelectableTreeNode>>>();

    protected state: TreeSelectionState;

    @postConstruct()
    protected init(): void {
        this.state = new TreeSelectionState(this.tree);
    }

    dispose() {
        this.onSelectionChangedEmitter.dispose();
    }

    get selectedNodes(): ReadonlyArray<Readonly<SelectableTreeNode>> {
        return this.state.selection();
    }

    get onSelectionChanged(): Event<ReadonlyArray<Readonly<SelectableTreeNode>>> {
        return this.onSelectionChangedEmitter.event;
    }

    protected fireSelectionChanged(): void {
        this.onSelectionChangedEmitter.fire(this.state.selection());
    }

    addSelection(selectionOrTreeNode: TreeSelection | Readonly<SelectableTreeNode>): void {
        const selection = ((arg: TreeSelection | Readonly<SelectableTreeNode>): TreeSelection => {
            const type = TreeSelection.SelectionType.DEFAULT;
            if (TreeSelection.is(arg)) {
                return {
                    type,
                    ...arg
                };
            }
            const node = arg;
            return {
                type,
                node
            };
        })(selectionOrTreeNode);

        if (this.validateNode(selection.node) === undefined) {
            return;
        }

        const oldState = this.state;
        const newState = this.state.nextState(selection);
        const oldNodes = oldState.selection();
        const newNodes = newState.selection();

        const toUnselect = this.difference(oldNodes, newNodes);
        const toSelect = this.difference(newNodes, oldNodes);
        if (toUnselect.length === 0 && toSelect.length === 0) {
            return;
        }

        this.unselect(toUnselect);
        this.select(toSelect);
        this.removeFocus(oldNodes, newNodes);
        this.addFocus(newState.focus);

        this.state = newState;
        this.fireSelectionChanged();
    }

    protected unselect(nodes: ReadonlyArray<SelectableTreeNode>): void {
        nodes.forEach(node => node.selected = false);
    }

    protected select(nodes: ReadonlyArray<SelectableTreeNode>): void {
        nodes.forEach(node => node.selected = true);
    }

    protected removeFocus(...nodes: ReadonlyArray<SelectableTreeNode>[]): void {
        nodes.forEach(node => node.forEach(n => n.focus = false));
    }

    protected addFocus(node: SelectableTreeNode | undefined): void {
        if (node) {
            node.focus = true;
        }
    }

    /**
     * Returns an array of the difference of two arrays. The returned array contains all elements that are contained by
     * `left` and not contained by `right`. `right` may also contain elements not present in `left`: these are simply ignored.
     */
    protected difference<T>(left: ReadonlyArray<T>, right: ReadonlyArray<T>): ReadonlyArray<T> {
        return left.filter(item => right.indexOf(item) === -1);
    }

    /**
     * Returns a reference to the argument if the node exists in the tree. Otherwise, `undefined`.
     */
    protected validateNode(node: Readonly<TreeNode>): Readonly<TreeNode> | undefined {
        return this.tree.validateNode(node);
    }

}
