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

import { injectable } from 'inversify';
import { Event, Emitter, Disposable, DisposableCollection } from '../../common';

export const Tree = Symbol('Tree');

/**
 * The tree - an abstract data type.
 */
export interface Tree extends Disposable {
    /**
     * A root node of this tree.
     * Undefined if there is no root node.
     * Setting a root node refreshes the tree.
     */
    root: TreeNode | undefined;
    /**
     * Emit when the tree is changed.
     */
    readonly onChanged: Event<void>;
    /**
     * Return a node for the given identifier or undefined if such does not exist.
     */
    getNode(id: string | undefined): TreeNode | undefined;
    /**
     * Return a valid node in this tree matching to the given; otherwise undefined.
     */
    validateNode(node: TreeNode | undefined): TreeNode | undefined;
    /**
     * Refresh children of the root node.
     */
    refresh(): Promise<void>;
    /**
     * Refresh children of the given node if it is valid.
     */
    refresh(parent: Readonly<CompositeTreeNode>): Promise<void>;
    /**
     * Emit when the children of the given node are refreshed.
     */
    readonly onNodeRefreshed: Event<Readonly<CompositeTreeNode>>;
}

/**
 * The tree node.
 */
export interface TreeNode {
    /**
     * An unique id of this node.
     */
    readonly id: string;
    /**
     * A human-readable name of this tree node.
     */
    readonly name: string;
    /**
     * A css string for this tree node icon.
     */
    readonly icon?: string;
    /**
     * A human-readable description of this tree node.
     */
    readonly description?: string;
    /**
     * Test whether this node should be rendered.
     * If undefined then node will be rendered.
     */
    readonly visible?: boolean;
    /**
     * A parent node of this tree node.
     * Undefined if this node is root.
     */
    readonly parent: Readonly<CompositeTreeNode> | undefined;
    /**
     * A previous sibling of this tree node.
     */
    readonly previousSibling?: TreeNode;
    /**
     * A next sibling of this tree node.
     */
    readonly nextSibling?: TreeNode;
}

export namespace TreeNode {
    export function equals(left: TreeNode | undefined, right: TreeNode | undefined): boolean {
        return left === right || (!!left && !!right && left.id === right.id);
    }

    export function isVisible(node: TreeNode | undefined): boolean {
        return !!node && (node.visible === undefined || node.visible);
    }
}

/**
 * The composite tree node.
 */
export interface CompositeTreeNode extends TreeNode {
    /**
     * Child nodes of this tree node.
     */
    children: ReadonlyArray<TreeNode>;
}

export namespace CompositeTreeNode {
    export function is(node: Object | undefined): node is CompositeTreeNode {
        return !!node && 'children' in node;
    }

    export function getFirstChild(parent: CompositeTreeNode): TreeNode | undefined {
        return parent.children[0];
    }

    export function getLastChild(parent: CompositeTreeNode): TreeNode | undefined {
        return parent.children[parent.children.length - 1];
    }

    export function isAncestor(parent: CompositeTreeNode, child: TreeNode | undefined): boolean {
        if (!child) {
            return false;
        }
        if (TreeNode.equals(parent, child.parent)) {
            return true;
        }
        return isAncestor(parent, child.parent);
    }

    export function indexOf(parent: CompositeTreeNode, node: TreeNode | undefined): number {
        if (!node) {
            return -1;
        }
        return parent.children.findIndex(child => TreeNode.equals(node, child));
    }

    export function addChildren(parent: CompositeTreeNode, children: TreeNode[]): CompositeTreeNode {
        for (const child of children) {
            addChild(parent, child);
        }
        return parent;
    }

    export function addChild(parent: CompositeTreeNode, child: TreeNode): CompositeTreeNode {
        const children = parent.children as TreeNode[];
        const index = children.findIndex(value => value.id === child.id);
        if (index !== -1) {
            children.splice(index, 1, child);
            setParent(child, index, parent);
        } else {
            children.push(child);
            setParent(child, parent.children.length - 1, parent);
        }
        return parent;
    }

    export function removeChild(parent: CompositeTreeNode, child: TreeNode): void {
        const children = parent.children as TreeNode[];
        const index = children.findIndex(value => value.id === child.id);
        if (index === -1) {
            return;
        }
        children.splice(index, 1);
        const { previousSibling, nextSibling } = child;
        if (previousSibling) {
            Object.assign(previousSibling, { nextSibling });
        }
        if (nextSibling) {
            Object.assign(nextSibling, { previousSibling });
        }
    }

    export function setParent(child: TreeNode, index: number, parent: CompositeTreeNode): void {
        const previousSibling = parent.children[index - 1];
        const nextSibling = parent.children[index + 1];
        Object.assign(child, { parent, previousSibling, nextSibling });
        if (previousSibling) {
            Object.assign(previousSibling, { nextSibling: child });
        }
        if (nextSibling) {
            Object.assign(nextSibling, { previousSibling: child });
        }
    }
}

/**
 * A default implementation of the tree.
 */
@injectable()
export class TreeImpl implements Tree {

    protected _root: TreeNode | undefined;
    protected readonly onChangedEmitter = new Emitter<void>();
    protected readonly onNodeRefreshedEmitter = new Emitter<CompositeTreeNode>();
    protected readonly toDispose = new DisposableCollection();

    protected nodes: {
        [id: string]: TreeNode | undefined
    } = {};

    constructor() {
        this.toDispose.push(this.onChangedEmitter);
        this.toDispose.push(this.onNodeRefreshedEmitter);
    }

    dispose(): void {
        this.nodes = {};
        this.toDispose.dispose();
    }

    get root(): TreeNode | undefined {
        return this._root;
    }

    set root(root: TreeNode | undefined) {
        this.nodes = {};
        this._root = root;
        this.addNode(root);
        this.refresh();
    }

    get onChanged(): Event<void> {
        return this.onChangedEmitter.event;
    }

    protected fireChanged(): void {
        this.onChangedEmitter.fire(undefined);
    }

    get onNodeRefreshed(): Event<CompositeTreeNode> {
        return this.onNodeRefreshedEmitter.event;
    }

    protected fireNodeRefreshed(parent: CompositeTreeNode): void {
        this.onNodeRefreshedEmitter.fire(parent);
        this.fireChanged();
    }

    getNode(id: string | undefined): TreeNode | undefined {
        return id !== undefined ? this.nodes[id] : undefined;
    }

    validateNode(node: TreeNode | undefined): TreeNode | undefined {
        const id = !!node ? node.id : undefined;
        return this.getNode(id);
    }

    async refresh(raw?: CompositeTreeNode): Promise<void> {
        const parent = !raw ? this._root : this.validateNode(raw);
        if (CompositeTreeNode.is(parent)) {
            const children = await this.resolveChildren(parent);
            this.setChildren(parent, children);
        }
        // FIXME: it should not be here
        // if the idea was to support refreshing of all kind of nodes, then API should be adapted
        this.fireChanged();
    }

    protected resolveChildren(parent: CompositeTreeNode): Promise<TreeNode[]> {
        return Promise.resolve(Array.from(parent.children));
    }

    protected setChildren(parent: CompositeTreeNode, children: TreeNode[]): void {
        this.removeNode(parent);
        parent.children = children;
        this.addNode(parent);
        this.fireNodeRefreshed(parent);
    }

    protected removeNode(node: TreeNode | undefined): void {
        if (CompositeTreeNode.is(node)) {
            node.children.forEach(child => this.removeNode(child));
        }
        if (node) {
            delete this.nodes[node.id];
        }
    }

    protected getRootNode(node: TreeNode): TreeNode {
        if (node.parent === undefined) {
            return node;
        } else {
            return this.getRootNode(node.parent);
        }
    }

    protected addNode(node: TreeNode | undefined): void {
        if (node) {
            const root = this.getRootNode(node);
            if (this.nodes[root.id] && this.nodes[root.id] !== root) {
                console.debug('Child node does not belong to this tree. Resetting root.');
                this.root = root;
                return;
            }
            this.nodes[node.id] = node;
        }
        if (CompositeTreeNode.is(node)) {
            const { children } = node;
            children.forEach((child, index) => {
                CompositeTreeNode.setParent(child, index, node);
                this.addNode(child);
            });
        }
    }

}
