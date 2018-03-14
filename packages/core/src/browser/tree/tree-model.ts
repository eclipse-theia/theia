/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, postConstruct } from 'inversify';
import { DisposableCollection, Event, Emitter, SelectionProvider } from '../../common';
import { Tree, TreeNode, CompositeTreeNode } from './tree';
import { TreeSelectionService, SelectableTreeNode, TreeSelection } from './tree-selection';
import { TreeExpansionService, ExpandableTreeNode } from './tree-expansion';
import { TreeNavigationService } from './tree-navigation';
import { TreeIterator, BottomUpTreeIterator, TopDownTreeIterator } from './tree-iterator';

/**
 * The tree model.
 */
export const TreeModel = Symbol('TreeModel');
export interface TreeModel extends Tree, TreeSelectionService, TreeExpansionService {

    /**
     * Expands the given node. If the `node` argument is `undefined`, then expands the currently selected tree node.
     * If multiple tree nodes are selected, expands the most recently selected tree node.
     */
    expandNode(node?: Readonly<ExpandableTreeNode>): Promise<boolean>;

    /**
     * Collapses the given node. If the `node` argument is `undefined`, then collapses the currently selected tree node.
     * If multiple tree nodes are selected, collapses the most recently selected tree node.
     */
    collapseNode(node?: Readonly<ExpandableTreeNode>): Promise<boolean>;

    /**
     * Toggles the expansion state of the given node. If not give, then it toggles the expansion state of the currently selected node.
     * If multiple nodes are selected, then the most recently selected tree node's expansion state will be toggled.
     */
    toggleNodeExpansion(node?: Readonly<ExpandableTreeNode>): Promise<void>;

    /**
     * Opens the given node or the currently selected on if the argument is `undefined`.
     * If multiple nodes are selected, open the most recently selected node.
     */
    openNode(node?: Readonly<TreeNode> | undefined): void;

    /**
     * Event when a node should be opened.
     */
    readonly onOpenNode: Event<Readonly<TreeNode>>;

    /**
     * Selects the parent node relatively to the selected taking into account node expansion.
     */
    selectParent(): void;

    /**
     * Navigates to the given node if it is defined.
     * Navigation sets a node as a root node and expand it.
     */
    navigateTo(node: Readonly<TreeNode> | undefined): Promise<void>;
    /**
     * Tests whether it is possible to navigate forward.
     */
    canNavigateForward(): boolean;

    /**
     * Tests whether it is possible to navigate backward.
     */
    canNavigateBackward(): boolean;

    /**
     * Navigates forward.
     */
    navigateForward(): Promise<void>;
    /**
     * Navigates backward.
     */
    navigateBackward(): Promise<void>;

    /**
     * Selects the previous node relatively to the currently selected one. This method takes the expansion state of the tree into consideration.
     */
    selectPrevNode(type?: TreeSelection.SelectionType): void;

    /**
     * Selects the next node relatively to the currently selected one. This method takes the expansion state of the tree into consideration.
     */
    selectNextNode(type?: TreeSelection.SelectionType): void;

    /**
     * Selects the given tree node. Has no effect when the node does not exist in the tree. Discards any previous selection state.
     */
    selectNode(node: Readonly<SelectableTreeNode>): void;

    /**
     * Selects the given node if it was not yet selected, or unselects it if it was. Keeps the previous selection state and updates it
     * with the current toggle selection.
     */
    toggleNode(node: Readonly<SelectableTreeNode>): void;

    /**
     * Selects a range of tree nodes. The target of the selection range is the argument, the from tree node is the previous selected node.
     * If no node was selected previously, invoking this method does nothing.
     */
    selectRange(node: Readonly<SelectableTreeNode>): void;

}

@injectable()
export class TreeModelImpl implements TreeModel, SelectionProvider<ReadonlyArray<Readonly<SelectableTreeNode>>> {

    @inject(Tree) protected readonly tree: Tree;
    @inject(TreeSelectionService) protected readonly selectionService: TreeSelectionService;
    @inject(TreeExpansionService) protected readonly expansionService: TreeExpansionService;
    @inject(TreeNavigationService) protected readonly navigationService: TreeNavigationService;

    protected readonly onChangedEmitter = new Emitter<void>();
    protected readonly onOpenNodeEmitter = new Emitter<TreeNode>();
    protected readonly toDispose = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.tree);
        this.toDispose.push(this.tree.onChanged(() => this.fireChanged()));

        this.toDispose.push(this.selectionService);
        this.toDispose.push(this.selectionService.onSelectionChanged(() => this.fireChanged()));

        this.toDispose.push(this.expansionService);
        this.toDispose.push(this.expansionService.onExpansionChanged(node => {
            this.fireChanged();
            if (!node.expanded && [...this.selectedNodes].some(selectedNode => CompositeTreeNode.isAncestor(node, selectedNode))) {
                if (SelectableTreeNode.isVisible(node)) {
                    this.selectNode(node);
                }
            }
        }));

        this.toDispose.push(this.onOpenNodeEmitter);
        this.toDispose.push(this.onChangedEmitter);
    }

    dispose() {
        this.toDispose.dispose();
    }

    get root() {
        return this.tree.root;
    }

    set root(root: TreeNode | undefined) {
        this.tree.root = root;
    }

    get onChanged(): Event<void> {
        return this.onChangedEmitter.event;
    }

    get onOpenNode(): Event<TreeNode> {
        return this.onOpenNodeEmitter.event;
    }

    protected fireChanged(): void {
        this.onChangedEmitter.fire(undefined);
    }

    get onNodeRefreshed() {
        return this.tree.onNodeRefreshed;
    }

    getNode(id: string | undefined) {
        return this.tree.getNode(id);
    }

    validateNode(node: TreeNode | undefined) {
        return this.tree.validateNode(node);
    }

    async refresh(parent?: Readonly<CompositeTreeNode>): Promise<void> {
        if (parent) {
            await this.tree.refresh(parent);
        } else {
            await this.tree.refresh();
        }
    }

    get selectedNodes() {
        return this.selectionService.selectedNodes;
    }

    get onSelectionChanged() {
        return this.selectionService.onSelectionChanged;
    }

    get onExpansionChanged() {
        return this.expansionService.onExpansionChanged;
    }

    async expandNode(raw?: Readonly<ExpandableTreeNode>): Promise<boolean> {
        for (const node of raw ? [raw] : this.selectedNodes) {
            if (ExpandableTreeNode.is(node)) {
                return await this.expansionService.expandNode(node);
            }
        }
        return false;
    }

    async collapseNode(raw?: Readonly<ExpandableTreeNode>): Promise<boolean> {
        for (const node of raw ? [raw] : this.selectedNodes) {
            if (ExpandableTreeNode.is(node)) {
                return await this.expansionService.collapseNode(node);
            }
        }
        return false;
    }

    async toggleNodeExpansion(raw?: Readonly<ExpandableTreeNode>): Promise<void> {
        for (const node of raw ? [raw] : this.selectedNodes) {
            if (ExpandableTreeNode.is(node)) {
                return await this.expansionService.toggleNodeExpansion(node);
            }
        }
    }

    selectPrevNode(type: TreeSelection.SelectionType = TreeSelection.SelectionType.DEFAULT): void {
        const node = this.selectedNodes[0];
        const iterator = this.createBackwardIterator(node);
        if (iterator) {
            this.selectNextVisibleNode(iterator, type);
        }
    }

    selectNextNode(type: TreeSelection.SelectionType = TreeSelection.SelectionType.DEFAULT): void {
        const node = this.selectedNodes[0];
        const iterator = this.createIterator(node);
        if (iterator) {
            this.selectNextVisibleNode(iterator, type);
        }
    }

    protected selectNextVisibleNode(iterator: TreeIterator, type: TreeSelection.SelectionType = TreeSelection.SelectionType.DEFAULT): void {
        // Skip the first item. // TODO: clean this up, and skip the first item in a different way without loading everything.
        iterator.next();
        let result = iterator.next();
        while (!result.done && !SelectableTreeNode.isVisible(result.value)) {
            result = iterator.next();
        }
        const node = result.value;
        if (SelectableTreeNode.isVisible(node)) {
            this.addSelection({ node, type });
        }
    }

    protected createBackwardIterator(node: TreeNode | undefined): TreeIterator | undefined {
        return node ? new BottomUpTreeIterator(node!, { pruneCollapsed: true }) : undefined;
    }

    protected createIterator(node: TreeNode | undefined): TreeIterator | undefined {
        return node ? new TopDownTreeIterator(node!, { pruneCollapsed: true }) : undefined;
    }

    openNode(raw?: TreeNode | undefined): void {
        const node = raw || this.selectedNodes[0];
        if (node) {
            this.doOpenNode(node);
            this.onOpenNodeEmitter.fire(node);
        }
    }

    protected doOpenNode(node: TreeNode): void {
        if (ExpandableTreeNode.is(node)) {
            this.toggleNodeExpansion(node);
        }
    }

    selectParent(): void {
        if (this.selectedNodes.length === 1) {
            const node = this.selectedNodes[0];
            const parent = SelectableTreeNode.getVisibleParent(node);
            if (parent) {
                this.selectNode(parent);
            }
        }
    }

    async navigateTo(node: TreeNode | undefined): Promise<void> {
        if (node) {
            this.navigationService.push(node);
            await this.doNavigate(node);
        }
    }

    canNavigateForward(): boolean {
        return !!this.navigationService.next;
    }

    canNavigateBackward(): boolean {
        return !!this.navigationService.prev;
    }

    async navigateForward(): Promise<void> {
        const node = this.navigationService.advance();
        if (node) {
            await this.doNavigate(node);
        }
    }

    async navigateBackward(): Promise<void> {
        const node = this.navigationService.retreat();
        if (node) {
            await this.doNavigate(node);
        }
    }

    protected async doNavigate(node: TreeNode): Promise<void> {
        this.tree.root = node;
        if (ExpandableTreeNode.is(node)) {
            await this.expandNode(node);
        }
        if (SelectableTreeNode.is(node)) {
            this.selectNode(node);
        }
    }

    addSelection(selectionOrTreeNode: TreeSelection | Readonly<SelectableTreeNode>): void {
        this.selectionService.addSelection(selectionOrTreeNode);
    }

    selectNode(node: Readonly<SelectableTreeNode>): void {
        this.addSelection(node);
    }

    toggleNode(node: Readonly<SelectableTreeNode>): void {
        this.addSelection({ node, type: TreeSelection.SelectionType.TOGGLE });
    }

    selectRange(node: Readonly<SelectableTreeNode>): void {
        this.addSelection({ node, type: TreeSelection.SelectionType.RANGE });
    }

}
