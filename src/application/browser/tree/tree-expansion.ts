/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Emitter, Event, Disposable } from "../../../application/common";
import { ICompositeTreeNode, ITreeNode, ITree } from "./tree";

export const ITreeExpansionService = Symbol("ITreeExpansionService");

/**
 * The tree expandable service.
 */
export interface ITreeExpansionService extends Disposable {
    /**
     * Emit when the node is expanded or collapsed.
     */
    readonly onExpansionChanged: Event<Readonly<IExpandableTreeNode>>;
    /**
     * If the given node is valid and collapsed then expand it.
     * Expanding a node refreshes all its children.
     *
     * Return true if a node has been expanded; otherwise false.
     */
    expandNode(node: Readonly<IExpandableTreeNode>): boolean;
    /**
     * If the given node is valid and expanded then collapse it.
     *
     * Return true if a node has been collapsed; otherwise false.
     */
    collapseNode(node: Readonly<IExpandableTreeNode>): boolean;
    /**
     * If the given node is invalid then does nothing.
     * If the given node is collapsed then expand it; otherwise collapse it.
     */
    toggleNodeExpansion(node: Readonly<IExpandableTreeNode>): void;
}

/**
 * The expandable tree node.
 */
export interface IExpandableTreeNode extends ICompositeTreeNode {
    /**
     * Test whether this tree node is expanded.
     */
    expanded: boolean;
}

export namespace IExpandableTreeNode {
    export function is(node: ITreeNode | undefined): node is IExpandableTreeNode {
        return !!node && ICompositeTreeNode.is(node) && 'expanded' in node;
    }

    export function isExpanded(node: ITreeNode | undefined): node is IExpandableTreeNode {
        return IExpandableTreeNode.is(node) && node.expanded;
    }

    export function isCollapsed(node: ITreeNode | undefined): node is IExpandableTreeNode {
        return IExpandableTreeNode.is(node) && !node.expanded;
    }
}

@injectable()
export class TreeExpansionService implements ITreeExpansionService {

    protected readonly onExpansionChangedEmitter = new Emitter<IExpandableTreeNode>();

    constructor( @inject(ITree) protected readonly tree: ITree) {
        tree.onNodeRefreshed(node => {
            for (const child of node.children) {
                if (IExpandableTreeNode.isExpanded(child)) {
                    this.tree.refresh(child);
                }
            }
        });
    }

    dispose() {
        this.onExpansionChangedEmitter.dispose();
    }

    get onExpansionChanged(): Event<IExpandableTreeNode> {
        return this.onExpansionChangedEmitter.event;
    }

    protected fireExpansionChanged(node: IExpandableTreeNode): void {
        this.onExpansionChangedEmitter.fire(node);
    }

    expandNode(raw: IExpandableTreeNode): boolean {
        const node = this.tree.validateNode(raw);
        if (IExpandableTreeNode.isCollapsed(node)) {
            return this.doExpandNode(node);
        }
        return false;
    }

    protected doExpandNode(node: IExpandableTreeNode): boolean {
        node.expanded = true;
        this.fireExpansionChanged(node);
        this.tree.refresh(node);
        return true;
    }

    collapseNode(raw: IExpandableTreeNode): boolean {
        const node = this.tree.validateNode(raw);
        if (IExpandableTreeNode.isExpanded(node)) {
            return this.doCollapseNode(node);
        }
        return false;
    }

    protected doCollapseNode(node: IExpandableTreeNode): boolean {
        node.expanded = false;
        this.fireExpansionChanged(node);
        return true;
    }

    toggleNodeExpansion(node: IExpandableTreeNode): void {
        if (node.expanded) {
            this.collapseNode(node);
        } else {
            this.expandNode(node);
        }
    }

}
