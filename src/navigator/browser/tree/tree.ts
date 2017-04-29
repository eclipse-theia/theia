/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { Event, Emitter, Disposable, DisposableCollection } from "../../../application/common";

export const ITree = Symbol("ITree");

/**
 * The tree - an abstract data type.
 */
export interface ITree extends Disposable {
    /**
     * A root node of this tree.
     * Undefined if there is no root node.
     * Setting a root node refreshes the tree.
     */
    root: ITreeNode | undefined;
    /**
     * Emit when the tree is changed.
     */
    readonly onChanged: Event<void>;
    /**
     * Return a node for the given identifier or undefined if such does not exist.
     */
    getNode(id: string | undefined): ITreeNode | undefined;
    /**
     * Return a valid node in this tree matching to the given; otherwise undefined.
     */
    validateNode(node: ITreeNode | undefined): ITreeNode | undefined;
    /**
     * Refresh children of the root node.
     */
    refresh(): void;
    /**
     * Refresh children of the given node if it is valid.
     */
    refresh(parent: Readonly<ICompositeTreeNode>): void;
    /**
     * Emit when the children of the give node are refreshed.
     */
    readonly onNodeRefreshed: Event<Readonly<ICompositeTreeNode>>;
}

/**
 * The tree node.
 */
export interface ITreeNode {
    /**
     * An unique id of this node.
     */
    readonly id: string;
    /**
     * A human-readable name of this tree node.
     */
    readonly name: string;
    /**
     * Test whether this node is visible.
     * If undefined then visible.
     */
    readonly visible?: boolean;
    /**
     * A parent node of this tree node.
     * Undefined if this node is root.
     */
    readonly parent: Readonly<ICompositeTreeNode> | undefined;
}

export namespace ITreeNode {
    export function equals(left: ITreeNode | undefined, right: ITreeNode | undefined): boolean {
        return left === right || (!!left && !!right && left.id === right.id);
    }

    export function isVisible(node: ITreeNode | undefined): boolean {
        return !!node && (node.visible === undefined || node.visible);
    }

    export function getPrevSibling(node: ITreeNode | undefined): ITreeNode | undefined {
        if (!node || !node.parent) {
            return undefined;
        }
        const parent = node.parent;
        const index = ICompositeTreeNode.indexOf(parent, node);
        return parent.children[index - 1];
    }

    export function getNextSibling(node: ITreeNode | undefined): ITreeNode | undefined {
        if (!node || !node.parent) {
            return undefined;
        }
        const parent = node.parent;
        const index = ICompositeTreeNode.indexOf(parent, node);
        return parent.children[index + 1];
    }
}

/**
 * The composite tree node.
 */
export interface ICompositeTreeNode extends ITreeNode {
    /**
     * Child nodes of this tree node.
     */
    children: ReadonlyArray<ITreeNode>;
}

export namespace ICompositeTreeNode {
    export function is(node: ITreeNode | undefined): node is ICompositeTreeNode {
        return !!node && 'children' in node;
    }

    export function getFirstChild(parent: ICompositeTreeNode): ITreeNode | undefined {
        return parent.children[0];
    }

    export function getLastChild(parent: ICompositeTreeNode): ITreeNode | undefined {
        return parent.children[parent.children.length - 1];
    }

    export function isAncestor(parent: ICompositeTreeNode, child: ITreeNode | undefined): boolean {
        if (!child) {
            return false;
        }
        if (ITreeNode.equals(parent, child.parent)) {
            return true;
        }
        return isAncestor(parent, child.parent);
    }

    export function indexOf(parent: ICompositeTreeNode, node: ITreeNode | undefined): number {
        if (!node) {
            return -1;
        }
        return parent.children.findIndex(child => ITreeNode.equals(node, child));
    }
}

/**
 * A default implementation of the tree.
 */
@injectable()
export class Tree implements ITree {

    protected _root: ITreeNode | undefined;
    protected readonly onChangedEmitter = new Emitter<void>();
    protected readonly onNodeRefreshedEmitter = new Emitter<ICompositeTreeNode>();
    protected readonly toDispose = new DisposableCollection();

    protected nodes: {
        [id: string]: ITreeNode | undefined
    } = {};

    constructor() {
        this.toDispose.push(this.onChangedEmitter);
        this.toDispose.push(this.onNodeRefreshedEmitter);
    }

    dispose(): void {
        this.nodes = {};
        this.toDispose.dispose();
    }

    get root(): ITreeNode | undefined {
        return this._root;
    }

    set root(root: ITreeNode | undefined) {
        if (!ITreeNode.equals(this._root, root)) {
            this.nodes = {};
            this._root = root;
            this.addNode(root);
            this.refresh();
        }
    }

    get onChanged(): Event<void> {
        return this.onChangedEmitter.event;
    }

    protected fireChanged(): void {
        this.onChangedEmitter.fire(undefined);
    }

    get onNodeRefreshed(): Event<ICompositeTreeNode> {
        return this.onNodeRefreshedEmitter.event;
    }

    protected fireNodeRefreshed(parent: ICompositeTreeNode): void {
        this.onNodeRefreshedEmitter.fire(parent);
        this.fireChanged();
    }

    getNode(id: string | undefined): ITreeNode | undefined {
        return id !== undefined ? this.nodes[id] : undefined;
    }

    validateNode(node: ITreeNode | undefined): ITreeNode | undefined {
        const id = !!node ? node.id : undefined;
        return this.getNode(id);
    }

    refresh(raw?: ICompositeTreeNode): void {
        const parent = !raw ? this._root : this.validateNode(raw);
        if (ICompositeTreeNode.is(parent)) {
            this.resolveChildren(parent).then(children => this.setChildren(parent, children));
        }
    }

    protected resolveChildren(parent: ICompositeTreeNode): Promise<ITreeNode[]> {
        return Promise.resolve([]);
    }

    protected setChildren(parent: ICompositeTreeNode, children: ITreeNode[]): void {
        this.removeNode(parent);
        parent.children = children;
        this.addNode(parent);
        this.fireNodeRefreshed(parent);
    }

    protected removeNode(node: ITreeNode | undefined): void {
        if (ICompositeTreeNode.is(node)) {
            node.children.forEach(child => this.removeNode(child));
        }
        if (node) {
            delete this.nodes[node.id];
        }
    }

    protected addNode(node: ITreeNode | undefined): void {
        if (node) {
            this.nodes[node.id] = node;
        }
        if (ICompositeTreeNode.is(node)) {
            node.children.forEach(child => this.addNode(child));
        }
    }

}
