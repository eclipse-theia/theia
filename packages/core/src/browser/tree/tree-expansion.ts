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
    expandNode(node: Readonly<ExpandableTreeNode>): Promise<boolean>;
    /**
     * If the given node is valid and expanded then collapse it.
     *
     * Return true if a node has been collapsed; otherwise false.
     */
    collapseNode(node: Readonly<ExpandableTreeNode>): Promise<boolean>;
    /**
     * If the given node is invalid then does nothing.
     * If the given node is collapsed then expand it; otherwise collapse it.
     */
    toggleNodeExpansion(node: Readonly<ExpandableTreeNode>): Promise<void>;
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

    async expandNode(raw: ExpandableTreeNode): Promise<boolean> {
        const node = this.tree.validateNode(raw);
        if (ExpandableTreeNode.isCollapsed(node)) {
            return await this.doExpandNode(node);
        }
        return false;
    }

    protected async doExpandNode(node: ExpandableTreeNode): Promise<boolean> {
        node.expanded = true;
        await this.tree.refresh(node);
        this.fireExpansionChanged(node);
        return true;
    }

    async collapseNode(raw: ExpandableTreeNode): Promise<boolean> {
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

    async toggleNodeExpansion(node: ExpandableTreeNode): Promise<void> {
        if (node.expanded) {
            await this.collapseNode(node);
        } else {
            await this.expandNode(node);
        }
    }

}
