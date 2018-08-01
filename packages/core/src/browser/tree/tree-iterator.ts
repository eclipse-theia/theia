/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { TreeNode, CompositeTreeNode } from './tree';
import { ExpandableTreeNode } from './tree-expansion';

export interface TreeIterator extends Iterator<TreeNode> {
}

export namespace TreeIterator {

    export interface Options {
        readonly pruneCollapsed: boolean
        readonly pruneSiblings: boolean
    }

    export const DEFAULT_OPTIONS: Options = {
        pruneCollapsed: false,
        pruneSiblings: false
    };

}

export abstract class AbstractTreeIterator implements TreeIterator, Iterable<TreeNode> {

    protected readonly delegate: IterableIterator<TreeNode>;
    protected readonly options: TreeIterator.Options;

    constructor(protected readonly root: TreeNode, options?: Partial<TreeIterator.Options>) {
        this.options = {
            ...TreeIterator.DEFAULT_OPTIONS,
            ...options
        };
        this.delegate = this.iterator(this.root);
    }

    [Symbol.iterator]() {
        return this.delegate;
    }

    next(): IteratorResult<TreeNode> {
        return this.delegate.next();
    }

    protected abstract iterator(node: TreeNode): IterableIterator<TreeNode>;

    protected children(node: TreeNode): TreeNode[] | undefined {
        if (!CompositeTreeNode.is(node)) {
            return undefined;
        }
        if (this.options.pruneCollapsed && this.isCollapsed(node)) {
            return undefined;
        }
        return node.children.slice();
    }

    protected isCollapsed(node: TreeNode): boolean {
        return ExpandableTreeNode.isCollapsed(node);
    }

    protected isEmpty(nodes: TreeNode[] | undefined): boolean {
        return nodes === undefined || nodes.length === 0;
    }

}

export class DepthFirstTreeIterator extends AbstractTreeIterator {

    protected iterator(root: TreeNode): IterableIterator<TreeNode> {
        return Iterators.depthFirst(root, this.children.bind(this));
    }

}

export class BreadthFirstTreeIterator extends AbstractTreeIterator {

    protected iterator(root: TreeNode): IterableIterator<TreeNode> {
        return Iterators.breadthFirst(root, this.children.bind(this));
    }

}

/**
 * This tree iterator visits all nodes from top to bottom considering the following rules.
 *
 * Let assume the following tree:
 * ```
 *   R
 *   |
 *   +---1
 *   |   |
 *   |   +---1.1
 *   |   |
 *   |   +---1.2
 *   |   |
 *   |   +---1.3
 *   |   |    |
 *   |   |    +---1.3.1
 *   |   |    |
 *   |   |    +---1.3.2
 *   |   |
 *   |   +---1.4
 *   |
 *   +---2
 *       |
 *       +---2.1
 * ```
 * When selecting `1.2` as the root, the normal `DepthFirstTreeIterator` would stop on `1.2` as it does not have children,
 * but this iterator will visit the next sibling (`1.3` and `1.4` but **not** `1.1`) nodes. So the expected traversal order will be
 * `1.2`, `1.3`, `1.3.1`, `1.3.2`,  and `1.4` then jumps to `2` and continues with `2.1`.
 */
export class TopDownTreeIterator extends AbstractTreeIterator {

    protected iterator(root: TreeNode): IterableIterator<TreeNode> {
        const doNext = this.doNext.bind(this);
        return (function* (): IterableIterator<TreeNode> {
            let next = root;
            while (next) {
                yield next;
                next = doNext(next);
            }
        }).bind(this)();
    }

    protected doNext(node: TreeNode): TreeNode | undefined {
        return this.findFirstChild(node) || this.findNextSibling(node);
    }

    protected findFirstChild(node: TreeNode): TreeNode | undefined {
        return (this.children(node) || [])[0];
    }

    protected findNextSibling(node: TreeNode | undefined): TreeNode | undefined {
        if (!node) {
            return undefined;
        }
        if (this.options.pruneSiblings && node === this.root) {
            return undefined;
        }
        if (node.nextSibling) {
            return node.nextSibling;
        }
        return this.findNextSibling(node.parent);
    }

}

/**
 * Unlike other tree iterators, this does not visit all the nodes, it stops once it reaches the root node
 * while traversing up the tree hierarchy in an inverse pre-order fashion. This is the counterpart of the `TopDownTreeIterator`.
 */
export class BottomUpTreeIterator extends AbstractTreeIterator {

    protected iterator(root: TreeNode): IterableIterator<TreeNode> {
        const doNext = this.doNext.bind(this);
        return (function* (): IterableIterator<TreeNode> {
            let next = root;
            while (next) {
                yield next;
                next = doNext(next);
            }
        }).bind(this)();
    }

    protected doNext(node: TreeNode): TreeNode | undefined {
        const previousSibling = node.previousSibling;
        const lastChild = this.lastChild(previousSibling);
        return lastChild || node.parent;
    }

    protected lastChild(node: TreeNode | undefined): TreeNode | undefined {
        const children = node ? this.children(node) : [];
        if (this.isEmpty(children)) {
            return node;
        }
        if (CompositeTreeNode.is(node)) {
            const lastChild = CompositeTreeNode.getLastChild(node);
            return this.lastChild(lastChild);
        }
        return undefined;
    }

}

export namespace Iterators {

    /**
     * Generator for depth first, pre-order tree traversal iteration.
     */
    export function* depthFirst<T>(root: T, children: (node: T) => T[] | undefined, include: (node: T) => boolean = () => true): IterableIterator<T> {
        const stack: T[] = [];
        stack.push(root);
        while (stack.length > 0) {
            const top = stack.pop()!;
            yield top;
            stack.push(...(children(top) || []).filter(include).reverse());
        }
    }

    /**
     * Generator for breadth first tree traversal iteration.
     */
    export function* breadthFirst<T>(root: T, children: (node: T) => T[] | undefined, include: (node: T) => boolean = () => true): IterableIterator<T> {
        const queue: T[] = [];
        queue.push(root);
        while (queue.length > 0) {
            const head = queue.shift()!;
            yield head;
            queue.push(...(children(head) || []).filter(include));
        }
    }

    /**
     * Returns with the iterator of the argument.
     */
    export function asIterator<T>(elements: ReadonlyArray<T>): IterableIterator<T> {
        return elements.slice()[Symbol.iterator]();
    }

    /**
     * Returns an iterator that cycles indefinitely over the elements of iterable.
     *  - If `start` is given it starts the iteration from that element. Otherwise, it starts with the first element of the array.
     *  - If `start` is given, it must contain by the `elements` array. Otherwise, an error will be thrown.
     *
     * **Warning**: Typical uses of the resulting iterator may produce an infinite loop. You should use an explicit break.
     */
    export function* cycle<T>(elements: ReadonlyArray<T>, start?: T): IterableIterator<T> {
        const copy = elements.slice();
        let index = !!start ? copy.indexOf(start) : 0;
        if (index === -1) {
            throw new Error(`${start} is not contained in ${copy}.`);
        }
        while (true) {
            yield copy[index];
            index++;
            if (index === copy.length) {
                index = 0;
            }
        }
    }

}
