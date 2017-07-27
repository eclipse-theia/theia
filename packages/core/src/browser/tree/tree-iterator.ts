/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ITreeNode, ICompositeTreeNode } from "./tree";
import { IExpandableTreeNode } from "./tree-expansion";

export interface ITreeNodeIterator extends Iterator<ITreeNode | undefined> {
}

export namespace ITreeNodeIterator {
    export interface IOptions {
        readonly pruneCollapsed: boolean
    }
    export const DEFAULT_OPTIONS: IOptions = {
        pruneCollapsed: false
    }
}

export abstract class AbstractTreeNodeIterator implements ITreeNodeIterator {
    constructor(protected node: ITreeNode | undefined,
        protected readonly options = ITreeNodeIterator.DEFAULT_OPTIONS) {
    }

    next(): IteratorResult<ITreeNode | undefined> {
        if (!this.node) {
            return {
                value: undefined,
                done: true,
            };
        }
        this.node = this.doNext(this.node);
        return {
            value: this.node,
            done: false
        };
    }

    protected abstract doNext(node: ITreeNode): ITreeNode | undefined;

    protected hasChildren(node: ITreeNode | undefined): node is ICompositeTreeNode {
        if (!ICompositeTreeNode.is(node)) {
            return false;
        }
        if (node.children.length === 0) {
            return false;
        }
        if (this.options.pruneCollapsed) {
            return IExpandableTreeNode.isExpanded(node);
        }
        return true;
    }
}

export class TreeNodeIterator extends AbstractTreeNodeIterator {

    protected doNext(node: ITreeNode): ITreeNode | undefined {
        return this.findFirstChild(node) || this.findNextSibling(node);
    }

    protected findFirstChild(node: ITreeNode | undefined): ITreeNode | undefined {
        return this.hasChildren(node) ? ICompositeTreeNode.getFirstChild(node) : undefined;
    }

    protected findNextSibling(node: ITreeNode | undefined): ITreeNode | undefined {
        if (!node) {
            return undefined;
        }
        const nextSibling = ITreeNode.getNextSibling(node);
        if (nextSibling) {
            return nextSibling;
        }
        return this.findNextSibling(node.parent);
    }

}

export class BackwardTreeNodeIterator extends AbstractTreeNodeIterator {

    protected doNext(node: ITreeNode): ITreeNode | undefined {
        const prevSibling = ITreeNode.getPrevSibling(node);
        const lastChild = this.findLastChild(prevSibling);
        return lastChild || node.parent;
    }

    protected findLastChild(node: ITreeNode | undefined): ITreeNode | undefined {
        if (!this.hasChildren(node)) {
            return node;
        }
        const lastChild = ICompositeTreeNode.getLastChild(node);
        return this.findLastChild(lastChild)
    }

}
