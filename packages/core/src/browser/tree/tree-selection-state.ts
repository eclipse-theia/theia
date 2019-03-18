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

import { Tree, TreeNode } from './tree';
import { DepthFirstTreeIterator } from './tree-iterator';
import { TreeSelection, SelectableTreeNode } from './tree-selection';

/**
 * A tree selection that might contain additional information about the tree node that has the focus.
 */
export interface FocusableTreeSelection extends TreeSelection {

    /**
     * The tree node that has the focus in the tree selection. In case of a range selection,
     * the `focus` differs from the `node`.
     */
    readonly focus?: SelectableTreeNode;

}

export namespace FocusableTreeSelection {

    /**
     * `true` if the argument is a focusable tree selection. Otherwise, `false`.
     */
    export function is(arg: object | undefined): arg is FocusableTreeSelection {
        return TreeSelection.is(arg) && 'focus' in arg;
    }

    /**
     * Returns with the tree node that has the focus if the argument is a focusable tree selection.
     * Otherwise, returns `undefined`.
     */
    export function focus(arg: TreeSelection | undefined): SelectableTreeNode | undefined {
        return is(arg) ? arg.focus : undefined;
    }
}

/**
 * Class for representing and managing the selection state and the focus of a tree.
 */
export class TreeSelectionState {

    constructor(
        protected readonly tree: Tree,
        protected readonly selectionStack: ReadonlyArray<FocusableTreeSelection> = []) {
    }

    nextState(selection: FocusableTreeSelection): TreeSelectionState {
        const { node, type } = {
            type: TreeSelection.SelectionType.DEFAULT,
            ...selection
        };
        switch (type) {
            case TreeSelection.SelectionType.DEFAULT: return this.handleDefault(this, node);
            case TreeSelection.SelectionType.TOGGLE: return this.handleToggle(this, node);
            case TreeSelection.SelectionType.RANGE: return this.handleRange(this, node);
            default: throw new Error(`Unexpected tree selection type: ${type}.`);
        }
    }

    selection(): ReadonlyArray<SelectableTreeNode> {
        const copy = this.checkNoDefaultSelection(this.selectionStack);
        const nodeIds = new Set<string>();
        for (let i = 0; i < copy.length; i++) {
            const { node, type } = copy[i];
            if (TreeSelection.isRange(type)) {
                const selection = copy[i];
                for (const id of this.selectionRange(selection).map(n => n.id)) {
                    nodeIds.add(id);
                }
            } else if (TreeSelection.isToggle(type)) {
                if (nodeIds.has(node.id)) {
                    nodeIds.delete(node.id);
                } else {
                    nodeIds.add(node.id);
                }
            }
        }
        return Array.from(nodeIds.keys()).map(id => this.tree.getNode(id)).filter(SelectableTreeNode.is).reverse();
    }

    get focus(): SelectableTreeNode | undefined {
        const copy = this.checkNoDefaultSelection(this.selectionStack);
        const candidate = copy[copy.length - 1].focus;
        return this.toSelectableTreeNode(candidate);
    }

    protected handleDefault(state: TreeSelectionState, node: Readonly<SelectableTreeNode>): TreeSelectionState {
        const { tree } = state;
        return new TreeSelectionState(tree, [{
            node,
            type: TreeSelection.SelectionType.TOGGLE,
            focus: node
        }]);
    }

    protected handleToggle(state: TreeSelectionState, node: Readonly<SelectableTreeNode>): TreeSelectionState {
        const { tree, selectionStack } = state;
        const copy = this.checkNoDefaultSelection(selectionStack).slice();
        const focus = (() => {
            const allRanges = copy.filter(selection => TreeSelection.isRange(selection));
            for (let i = allRanges.length - 1; i >= 0; i--) {
                const latestRangeIndex = copy.indexOf(allRanges[i]);
                const latestRangeSelection = copy[latestRangeIndex];
                const latestRange = latestRangeSelection && latestRangeSelection.focus ? this.selectionRange(latestRangeSelection) : [];
                if (latestRange.indexOf(node) !== -1) {
                    if (this.focus === latestRangeSelection.focus) {
                        return latestRangeSelection.focus || node;
                    } else {
                        return this.focus;
                    }
                }
            }
            return node;
        })();
        return new TreeSelectionState(tree, [...copy, {
            node,
            type: TreeSelection.SelectionType.TOGGLE,
            focus
        }]);
    }

    protected handleRange(state: TreeSelectionState, node: Readonly<SelectableTreeNode>): TreeSelectionState {
        const { tree, selectionStack } = state;
        const copy = this.checkNoDefaultSelection(selectionStack).slice();
        let focus = FocusableTreeSelection.focus(copy[copy.length - 1]);

        // Drop the previous range when we are trying to modify that.
        if (TreeSelection.isRange(copy[copy.length - 1])) {
            const range = this.selectionRange(copy.pop()!);
            // And we drop all preceding individual nodes that were contained in the range we are dropping.
            // That means, anytime we cover individual nodes with a range, they will belong to the range so we need to drop them now.
            for (let i = copy.length - 1; i >= 0; i--) {
                if (range.indexOf(copy[i].node) !== -1) {
                    // Make sure to keep a reference to the focus while we are discarding previous elements. Otherwise, we lose this information.
                    focus = copy[i].focus;
                    copy.splice(i, 1);
                }
            }
        }
        return new TreeSelectionState(tree, [...copy, {
            node,
            type: TreeSelection.SelectionType.RANGE,
            focus
        }]);
    }

    /**
     * Returns with an array of items representing the selection range. The from node is the `focus` the to node
     * is the selected node itself on the tree selection. Both the `from` node and the `to` node are inclusive.
     */
    protected selectionRange(selection: FocusableTreeSelection): Readonly<SelectableTreeNode>[] {
        const fromNode = selection.focus;
        const toNode = selection.node;
        if (fromNode === undefined) {
            return [];
        }
        if (toNode === fromNode) {
            return [toNode];
        }
        const { root } = this.tree;
        if (root === undefined) {
            return [];
        }
        const to = this.tree.validateNode(toNode);
        if (to === undefined) {
            return [];
        }
        const from = this.tree.validateNode(fromNode);
        if (from === undefined) {
            return [];
        }
        let started = false;
        let finished = false;
        const range = [];
        for (const node of new DepthFirstTreeIterator(root, { pruneCollapsed: true })) {
            if (finished) {
                break;
            }
            // Only collect items which are between (inclusive) the `from` node and the `to` node.
            if (node === from || node === to) {
                if (started) {
                    finished = true;
                } else {
                    started = true;
                }
            }
            if (started) {
                range.push(node);
            }
        }

        // We need to reverse the selection range order.
        if (range.indexOf(from) > range.indexOf(to)) {
            range.reverse();
        }
        return range.filter(SelectableTreeNode.is);
    }

    protected toSelectableTreeNode(node: TreeNode | undefined): SelectableTreeNode | undefined {
        if (!!node) {
            const candidate = this.tree.getNode(node.id);
            if (!!candidate) {
                if (SelectableTreeNode.is(candidate)) {
                    return candidate;
                } else {
                    console.warn(`Could not map to a selectable tree node. Node with ID: ${node.id} is not a selectable node.`);
                }
            } else {
                console.warn(`Could not map to a selectable tree node. Node does not exist with ID: ${node.id}.`);
            }
        }
        return undefined;
    }

    /**
     * Checks whether the argument contains any `DEFAULT` tree selection type. If yes, throws an error, otherwise returns with a reference the argument.
     */
    protected checkNoDefaultSelection<T extends TreeSelection>(selections: ReadonlyArray<T>): ReadonlyArray<T> {
        if (selections.some(selection => selection.type === undefined || selection.type === TreeSelection.SelectionType.DEFAULT)) {
            throw new Error(`Unexpected DEFAULT selection type. [${selections.map(selection => `ID: ${selection.node.id} | ${selection.type}`).join(', ')}]`);
        }
        return selections;
    }

}
