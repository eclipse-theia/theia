/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, postConstruct } from "inversify";
import { Emitter, Event, Disposable } from "../../common";
import { CompositeTreeNode, TreeNode, Tree } from "./tree";

export const TreeExpansionService = Symbol("TreeExpansionService");

/**
 * The tree expandable service.
 */
export interface TreeExpansionService extends Disposable {
    /**
     * Emit when the node is expanded or collapsed.
     */
    readonly onExpansionChanged: Event<Readonly<ExpandableTreeNode>>;
    /**
     * If the given node is valid and collapsed then expand it.
     * Expanding a node refreshes all its children.
     *
     * Return true if a node has been expanded; otherwise false.
     */
    expandNode(node: Readonly<ExpandableTreeNode>): boolean;
    /**
     * If the given node is valid and expanded then collapse it.
     *
     * Return true if a node has been collapsed; otherwise false.
     */
    collapseNode(node: Readonly<ExpandableTreeNode>): boolean;
    /**
     * If the given node is invalid then does nothing.
     * If the given node is collapsed then expand it; otherwise collapse it.
     */
    toggleNodeExpansion(node: Readonly<ExpandableTreeNode>): void;
}

/**
 * The expandable tree node.
 */
export interface ExpandableTreeNode extends CompositeTreeNode {
    /**
     * Test whether this tree node is expanded.
     */
    expanded: boolean;
}

export namespace ExpandableTreeNode {
    export function is(node: TreeNode | undefined): node is ExpandableTreeNode {
        return !!node && CompositeTreeNode.is(node) && 'expanded' in node;
    }

    export function isExpanded(node: TreeNode | undefined): node is ExpandableTreeNode {
        return ExpandableTreeNode.is(node) && node.expanded;
    }

    export function isCollapsed(node: TreeNode | undefined): node is ExpandableTreeNode {
        return ExpandableTreeNode.is(node) && !node.expanded;
    }
}

@injectable()
export class TreeExpansionServiceImpl implements TreeExpansionService {

    @inject(Tree) protected readonly tree: Tree;
    protected readonly onExpansionChangedEmitter = new Emitter<ExpandableTreeNode>();

    @postConstruct()
    protected init(): void {
        this.tree.onNodeRefreshed(node => {
            for (const child of node.children) {
                if (ExpandableTreeNode.isExpanded(child)) {
                    this.tree.refresh(child);
                }
            }
        });
    }

    dispose() {
        this.onExpansionChangedEmitter.dispose();
    }

    get onExpansionChanged(): Event<ExpandableTreeNode> {
        return this.onExpansionChangedEmitter.event;
    }

    protected fireExpansionChanged(node: ExpandableTreeNode): void {
        this.onExpansionChangedEmitter.fire(node);
    }

    expandNode(raw: ExpandableTreeNode): boolean {
        const node = this.tree.validateNode(raw);
        if (ExpandableTreeNode.isCollapsed(node)) {
            return this.doExpandNode(node);
        }
        return false;
    }

    protected doExpandNode(node: ExpandableTreeNode): boolean {
        node.expanded = true;
        this.fireExpansionChanged(node);
        this.tree.refresh(node);
        return true;
    }

    collapseNode(raw: ExpandableTreeNode): boolean {
        const node = this.tree.validateNode(raw);
        if (ExpandableTreeNode.isExpanded(node)) {
            return this.doCollapseNode(node);
        }
        return false;
    }

    protected doCollapseNode(node: ExpandableTreeNode): boolean {
        node.expanded = false;
        this.fireExpansionChanged(node);
        return true;
    }

    toggleNodeExpansion(node: ExpandableTreeNode): void {
        if (node.expanded) {
            this.collapseNode(node);
        } else {
            this.expandNode(node);
        }
    }

}
