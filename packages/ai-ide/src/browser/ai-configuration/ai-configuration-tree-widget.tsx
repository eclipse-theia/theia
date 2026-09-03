// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { Emitter, Event } from '@theia/core';
import { Container, inject, injectable, interfaces, postConstruct } from '@theia/core/shared/inversify';
import {
    codicon, CompositeTreeNode, ContextMenuRenderer, createTreeContainer, ExpandableTreeNode, NodeProps, SelectableTreeNode,
    TreeModel, TreeNode, TreeProps, TreeWidget
} from '@theia/core/lib/browser';
import { AIActivationService } from '@theia/ai-core/lib/browser/ai-activation-service';
import { AiConfigurationCategoryRegistry } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category-registry';
import { AiConfigurationSelectionModel } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-selection-model';
import {
    AiConfigurationAddDescriptor,
    AiConfigurationCategory,
    AiConfigurationCategoryId,
    AiConfigurationSelection
} from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { AiConfigurationTreeModel } from './ai-configuration-tree-model';
import { AiConfigurationCategoryNode, AiConfigurationItemNode, AiConfigurationSeparatorNode, AiConfigurationTree } from './ai-configuration-tree-nodes';
import { AiConfigurationSearch } from './ai-configuration-search';

@injectable()
export class AiConfigurationTreeWidget extends TreeWidget {

    static readonly ID = 'ai-configuration-tree';

    @inject(AiConfigurationCategoryRegistry)
    protected readonly registry: AiConfigurationCategoryRegistry;

    @inject(AiConfigurationSelectionModel)
    protected readonly selectionModel: AiConfigurationSelectionModel;

    @inject(AIActivationService)
    protected readonly activationService: AIActivationService;

    /** Guards the tree ↔ selection-model round trip against re-entrant updates. */
    protected updatingSelection = false;
    /** Set while a rebuild is in flight, so selection is restored once the tree is refreshed. */
    protected pendingSelectionRestore = false;
    protected expansionState = new Map<string, boolean>();

    /** Active live-filter terms (empty => no filtering). */
    protected filterTerms: string[] = [];
    /** Expansion snapshot captured when filtering starts, restored when it ends. */
    protected preFilterExpansion: Map<string, boolean> | undefined;

    protected readonly onDidChangeExpansionEmitter = new Emitter<void>();
    /** Fires when a category's expansion changes or the tree rebuilds, so the toolbar toggle can update. */
    readonly onDidChangeExpansion: Event<void> = this.onDidChangeExpansionEmitter.event;

    constructor(
        @inject(TreeProps) props: TreeProps,
        @inject(TreeModel) model: TreeModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer
    ) {
        super(props, model, contextMenuRenderer);
    }

    @postConstruct()
    protected override init(): void {
        super.init();
        this.id = AiConfigurationTreeWidget.ID;
        this.addClass('ai-configuration-tree');
        this.toDispose.push(this.onDidChangeExpansionEmitter);
        this.toDispose.push(this.registry.onDidChange(() => this.buildTree()));
        this.toDispose.push(this.model.onChanged(() => this.onModelChanged()));
        // The toolbar toggle mirrors the tree: rebuilds (onChanged) and expand/collapse both re-sync it.
        this.toDispose.push(this.model.onChanged(() => this.onDidChangeExpansionEmitter.fire()));
        this.toDispose.push(this.model.onExpansionChanged(() => this.onDidChangeExpansionEmitter.fire()));
        this.toDispose.push(this.model.onSelectionChanged(() => this.handleTreeSelectionChanged()));
        this.toDispose.push(this.selectionModel.onDidChangeSelection(selection => this.reflectSelection(selection)));
        // When AI features are toggled off, hide the other categories and fall back to the General page
        // (the only place to re-enable them); rebuild to bring them back once AI is on again.
        this.toDispose.push(this.activationService.onDidChangeActiveStatus(() => {
            this.buildTree();
            if (!this.activationService.isActive) {
                this.selectionModel.select({ categoryId: AiConfigurationCategoryId.GENERAL });
            }
        }));
        this.buildTree();
    }

    protected buildTree(): void {
        this.expansionState = this.captureExpansion();
        this.pendingSelectionRestore = true;
        this.model.root = AiConfigurationTree.buildRoot(this.visibleCategories(), {
            isExpanded: categoryId => this.expansionState.get(categoryId)
        });
    }

    /**
     * The categories shown in the tree. While AI features are disabled only General is shown, so the
     * view focuses on re-enabling them (mirroring how the General page disables its dependent settings).
     */
    protected visibleCategories(): AiConfigurationCategory[] {
        const categories = this.registry.getCategories();
        if (this.activationService.isActive) {
            return categories;
        }
        return categories.filter(category => category.id === AiConfigurationCategoryId.GENERAL);
    }

    protected captureExpansion(): Map<string, boolean> {
        const state = new Map<string, boolean>();
        const root = this.model.root;
        if (CompositeTreeNode.is(root)) {
            for (const child of root.children) {
                if (AiConfigurationCategoryNode.is(child) && ExpandableTreeNode.is(child)) {
                    state.set(child.categoryId, child.expanded);
                }
            }
        }
        return state;
    }

    /** Restores the selection after a rebuild once the target node has been indexed. */
    protected onModelChanged(): void {
        if (!this.pendingSelectionRestore) {
            return;
        }
        const selection = this.selectionModel.getSelection();
        if (!selection) {
            this.pendingSelectionRestore = false;
            return;
        }
        // Expand the owning category so an item child gets indexed on the next refresh.
        if (selection.itemId) {
            const categoryNode = this.model.getNode(AiConfigurationTree.categoryNodeId(selection.categoryId));
            if (ExpandableTreeNode.is(categoryNode) && !categoryNode.expanded) {
                this.model.expandNode(categoryNode);
            }
        }
        const node = this.model.getNode(this.selectionNodeId(selection));
        if (SelectableTreeNode.is(node)) {
            this.pendingSelectionRestore = false;
            this.applyTreeSelection(node);
        }
    }

    /** Selection model → tree. */
    protected reflectSelection(selection: AiConfigurationSelection | undefined): void {
        if (!selection) {
            return;
        }
        const node = this.model.getNode(this.selectionNodeId(selection));
        if (SelectableTreeNode.is(node)) {
            if (!node.selected) {
                this.applyTreeSelection(node);
            }
        } else {
            // The node is not indexed yet (e.g. during a rebuild); restore on the next refresh.
            this.pendingSelectionRestore = true;
        }
    }

    /** Tree → selection model. */
    protected handleTreeSelectionChanged(): void {
        if (this.updatingSelection) {
            return;
        }
        const node = this.model.selectedNodes[0];
        if (AiConfigurationItemNode.is(node)) {
            // While filtering, jump to and flash the child's own matching setting (e.g. a provider setting);
            // otherwise just open the child page.
            this.selectionModel.select(this.matchingSettingTarget(node.categoryId, node.itemId) ?? { categoryId: node.categoryId, itemId: node.itemId });
        } else if (AiConfigurationCategoryNode.is(node)) {
            // While filtering, if the category was matched by one of its own (page-level) settings, jump to and
            // flash that setting's row rather than just opening the category — useful on the General page, which
            // gathers many settings across sub-sections. Settings that live in a child are reached via that child.
            this.selectionModel.select(this.matchingSettingTarget(node.categoryId) ?? { categoryId: node.categoryId });
        }
    }

    /**
     * When a live filter is active and a category's own label does not match, returns the navigation target of
     * the first setting that matches and lives at the requested location (with a `highlight` so the detail pane
     * scrolls to and flashes the row): page-level settings when `itemId` is omitted, the given child's settings
     * otherwise. Returns `undefined` otherwise, so selecting the node opens its overview as usual.
     */
    protected matchingSettingTarget(categoryId: string, itemId?: string): AiConfigurationSelection | undefined {
        if (this.filterTerms.length === 0) {
            return undefined;
        }
        const category = this.registry.getCategory(categoryId);
        if (!category || this.labelMatches(category.label)) {
            return undefined;
        }
        const match = (category.search?.getSearchItems() ?? []).find(item =>
            item.target.highlight
            && item.target.itemId === itemId
            && AiConfigurationSearch.matchesTerms(AiConfigurationSearch.matchKey(item), this.filterTerms));
        return match?.target;
    }

    protected applyTreeSelection(node: SelectableTreeNode): void {
        this.updatingSelection = true;
        try {
            if (AiConfigurationItemNode.is(node) && ExpandableTreeNode.is(node.parent) && !node.parent.expanded) {
                this.model.expandNode(node.parent);
            }
            this.model.selectNode(node);
        } finally {
            this.updatingSelection = false;
        }
    }

    protected selectionNodeId(selection: AiConfigurationSelection): string {
        return selection.itemId
            ? AiConfigurationTree.itemNodeId(selection.categoryId, selection.itemId)
            : AiConfigurationTree.categoryNodeId(selection.categoryId);
    }

    /** Expands every collapsible category (used by the Expand All toolbar action). */
    expandAll(): void {
        this.forEachCategory(node => {
            if (!node.expanded) {
                this.model.expandNode(node);
            }
        });
    }

    /** Collapses every collapsible category (used by the Collapse All toolbar action). */
    collapseAll(): void {
        this.forEachCategory(node => {
            if (node.expanded) {
                this.model.collapseNode(node);
            }
        });
    }

    /**
     * Summarises the tree's expansion for the toolbar toggle: `'none'` when no category can be expanded,
     * `'all-expanded'` when every expandable category is expanded, otherwise `'partially-collapsed'`.
     */
    getExpansionSummary(): 'none' | 'all-expanded' | 'partially-collapsed' {
        let expandable = 0;
        let expanded = 0;
        this.forEachCategory(node => {
            expandable++;
            if (node.expanded) {
                expanded++;
            }
        });
        if (expandable === 0) {
            return 'none';
        }
        return expanded === expandable ? 'all-expanded' : 'partially-collapsed';
    }

    protected forEachCategory(callback: (node: AiConfigurationCategoryNode & ExpandableTreeNode) => void): void {
        const root = this.model.root;
        if (!CompositeTreeNode.is(root)) {
            return;
        }
        for (const child of root.children) {
            if (AiConfigurationCategoryNode.is(child) && ExpandableTreeNode.is(child)) {
                callback(child);
            }
        }
    }

    /**
     * Live tree filter driven by the search box: hides non-matching category/item
     * nodes and the separator, and (un)expands categories so matches stay visible.
     */
    setFilter(text: string): void {
        const terms = AiConfigurationSearch.terms(text);
        const wasFiltering = this.filterTerms.length > 0;
        const nowFiltering = terms.length > 0;
        this.filterTerms = terms;
        if (nowFiltering) {
            if (!wasFiltering) {
                this.preFilterExpansion = this.captureExpansion();
            }
            this.expandMatchingCategories();
        } else if (wasFiltering) {
            this.restoreExpansion();
        }
        this.updateRows();
    }

    protected expandMatchingCategories(): void {
        const root = this.model.root;
        if (!CompositeTreeNode.is(root)) {
            return;
        }
        for (const child of root.children) {
            if (AiConfigurationCategoryNode.is(child) && ExpandableTreeNode.is(child) && !child.expanded && this.matchesFilter(child)) {
                this.model.expandNode(child);
            }
        }
    }

    protected restoreExpansion(): void {
        const state = this.preFilterExpansion;
        this.preFilterExpansion = undefined;
        const root = this.model.root;
        if (!state || !CompositeTreeNode.is(root)) {
            return;
        }
        for (const child of root.children) {
            if (AiConfigurationCategoryNode.is(child) && ExpandableTreeNode.is(child)) {
                const wasExpanded = state.get(child.categoryId) ?? false;
                if (wasExpanded && !child.expanded) {
                    this.model.expandNode(child);
                } else if (!wasExpanded && child.expanded) {
                    this.model.collapseNode(child);
                }
            }
        }
    }

    protected override shouldDisplayNode(node: TreeNode): boolean {
        if (!super.shouldDisplayNode(node)) {
            return false;
        }
        if (this.filterTerms.length === 0) {
            return true;
        }
        if (AiConfigurationSeparatorNode.is(node)) {
            return false;
        }
        return this.matchesFilter(node);
    }

    /**
     * A category matches if its own label, any child, or any of its settings match; an item matches if its
     * label or its category's label matches. Matching a category's settings means their names AND ids are
     * searchable (via the deep-search index), so typing a setting id/name reveals its owning category.
     */
    protected matchesFilter(node: TreeNode): boolean {
        if (AiConfigurationCategoryNode.is(node)) {
            return this.labelMatches(node.name)
                || node.children.some(child => this.labelMatches(child.name))
                || this.settingsMatch(node.categoryId);
        }
        if (AiConfigurationItemNode.is(node)) {
            // Reveal the specific child (e.g. an `anthropic` provider) whose own settings match, so searching a
            // setting id like `ai-features.anthropic.serverSideCompaction` surfaces exactly where it lives —
            // not just the parent category. The same setting may live under several children; each is revealed.
            return this.labelMatches(node.name)
                || (AiConfigurationCategoryNode.is(node.parent) && this.labelMatches(node.parent.name))
                || this.settingsMatch(node.categoryId, node.itemId);
        }
        return false;
    }

    /**
     * Whether a category's deep-search items (setting names, ids/keywords) match the active terms. With `itemId`
     * only settings that live in that child node are considered; without it, every setting of the category.
     */
    protected settingsMatch(categoryId: string, itemId?: string): boolean {
        const items = this.registry.getCategory(categoryId)?.search?.getSearchItems() ?? [];
        return items.some(item =>
            (itemId === undefined || item.target.itemId === itemId)
            && AiConfigurationSearch.matchesTerms(AiConfigurationSearch.matchKey(item), this.filterTerms));
    }

    protected labelMatches(label: string | undefined): boolean {
        if (!label) {
            return false;
        }
        return AiConfigurationSearch.matchesTerms(label.toLowerCase(), this.filterTerms);
    }

    protected override renderIcon(node: TreeNode, props: NodeProps): React.ReactNode {
        if (AiConfigurationCategoryNode.is(node) || AiConfigurationItemNode.is(node)) {
            return <div className={`ai-configuration-tree-node-icon ${node.iconClass}`}></div>;
        }
        return super.renderIcon(node, props);
    }

    /**
     * Trailing decorations: an item's state as a colored dot (e.g. whether an MCP server is running), and a
     * category's "create item" action, so adding an agent or a server does not require opening the page
     * first. The action button is revealed on hover/focus of the row, like the Settings UI's gear.
     */
    protected override renderTailDecorations(node: TreeNode, props: NodeProps): React.ReactNode {
        if (AiConfigurationItemNode.is(node) && node.status) {
            // Boxed in the same trailing slot as a category's action button so the dot and the `+` line up.
            return <span className='ai-configuration-tree-node-decoration' title={node.status.tooltip ?? node.status.label}>
                <span
                    className={`ai-configuration-status ai-configuration-status-${node.status.kind}`}
                    // The dot repeats what the detail page states in words, so it is decorative for screen readers.
                    aria-hidden={true}
                ></span>
            </span>;
        }
        if (AiConfigurationCategoryNode.is(node)) {
            const add = this.getAddAction(node.categoryId);
            if (add) {
                return <button
                    type='button'
                    className='ai-configuration-tree-node-decoration ai-configuration-tree-node-action'
                    title={add.label}
                    aria-label={add.label}
                    onClick={event => {
                        // Without this the click also selects (or expands) the row behind the button.
                        event.stopPropagation();
                        add.run();
                    }}
                >
                    <span aria-hidden='true' className={add.iconClass ?? codicon('add')}></span>
                </button>;
            }
        }
        return super.renderTailDecorations(node, props);
    }

    /**
     * The category's add action, if it offers one. Navigation goes through the selection model, so running the
     * action from the tree behaves like running it from the category's own page.
     */
    protected getAddAction(categoryId: string): AiConfigurationAddDescriptor | undefined {
        const renderer = this.registry.getCategory(categoryId)?.renderer;
        return renderer?.getAddAction?.({
            scope: 'user',
            navigate: selection => this.selectionModel.select(selection),
            update: () => { }
        });
    }

    protected override createNodeClassNames(node: TreeNode, props: NodeProps): string[] {
        const classNames = super.createNodeClassNames(node, props);
        if (AiConfigurationSeparatorNode.is(node)) {
            classNames.push('ai-configuration-tree-separator');
        }
        return classNames;
    }
}

export function createAiConfigurationTreeContainer(parent: interfaces.Container): Container {
    return createTreeContainer(parent, {
        model: AiConfigurationTreeModel,
        widget: AiConfigurationTreeWidget,
        props: {
            virtualized: false,
            search: false,
            leftPadding: 8
        }
    });
}
