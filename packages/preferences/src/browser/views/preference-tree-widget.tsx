/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import { inject, injectable, postConstruct } from 'inversify';
import { Message } from '@phosphor/messaging';
import {
    ContextMenuRenderer,
    ExpandableTreeNode,
    PreferenceService,
    TreeModel,
    TreeNode,
    TreeProps,
    TreeWidget,
    SelectableTreeNode,
    TREE_NODE_CONTENT_CLASS,
    NodeProps,
    CompositeTreeNode,
} from '@theia/core/lib/browser';
import { PreferenceConfigurations } from '@theia/core/lib/browser/preferences/preference-configurations';
import React = require('react');
import { PreferencesEventService } from '../util/preference-event-service';
import { PreferencesDecorator } from '../preferences-decorator';
import { PreferencesTreeProvider } from '../preference-tree-provider';
import { Preference } from '../util/preference-types';

@injectable()
export class PreferencesTreeWidget extends TreeWidget {
    static ID = 'preferences.tree';

    protected shouldFireSelectionEvents: boolean = true;
    protected firstVisibleLeafNodeID: string;

    @inject(PreferenceService) protected readonly preferenceService: PreferenceService;
    @inject(PreferencesDecorator) protected readonly decorator: PreferencesDecorator;
    @inject(PreferenceConfigurations) protected readonly preferenceConfigs: PreferenceConfigurations;
    @inject(PreferencesTreeProvider) protected readonly preferenceTreeProvider: PreferencesTreeProvider;
    @inject(TreeModel) readonly model: TreeModel;
    @inject(TreeProps) protected readonly treeProps: TreeProps;
    @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer;
    @inject(PreferencesEventService) protected readonly preferencesEventService: PreferencesEventService;

    @postConstruct()
    init(): void {
        super.init();
        this.preferencesEventService.onDisplayChanged.event(didChangeTree => {
            if (didChangeTree) {
                this.updateDisplay();
            }
        });
        this.preferencesEventService.onEditorScroll.event(e => {
            this.handleEditorScroll(e.firstVisibleChildId);
        });
        this.id = PreferencesTreeWidget.ID;
    }

    protected handleEditorScroll(firstVisibleChildId: string): void {
        this.shouldFireSelectionEvents = false;
        if (firstVisibleChildId !== this.firstVisibleLeafNodeID) {
            const { selectionAncestor, expansionAncestor } = this.getAncestorsForVisibleNode(firstVisibleChildId);

            this.firstVisibleLeafNodeID = firstVisibleChildId;
            this.model.expandNode(expansionAncestor);
            this.collapseAllExcept(expansionAncestor);
            if (selectionAncestor) {
                this.model.selectNode(selectionAncestor);
            }
        }
        this.shouldFireSelectionEvents = true;
    }

    protected collapseAllExcept(openNode: Preference.TreeExtension | undefined): void {
        const children = (this.model.root as CompositeTreeNode).children as ExpandableTreeNode[];
        children.forEach(child => {
            if (child !== openNode && child.expanded) {
                this.model.collapseNode(child);
            }
        });
    }

    protected getAncestorsForVisibleNode(visibleNodeID: string): { selectionAncestor: SelectableTreeNode | undefined, expansionAncestor: ExpandableTreeNode | undefined; } {
        const isNonLeafNode = visibleNodeID.endsWith('-id');
        const isSubgroupNode = isNonLeafNode && visibleNodeID.includes('.');
        let expansionAncestor: ExpandableTreeNode;
        let selectionAncestor: SelectableTreeNode;

        if (isSubgroupNode) {
            selectionAncestor = this.model.getNode(visibleNodeID) as SelectableTreeNode;
            expansionAncestor = selectionAncestor?.parent as ExpandableTreeNode;
        } else if (isNonLeafNode) {
            selectionAncestor = this.model.getNode(visibleNodeID) as SelectableTreeNode;
            expansionAncestor = selectionAncestor as Preference.TreeExtension as ExpandableTreeNode;
        } else {
            const labels = visibleNodeID.split('.');
            const hasSubgroupAncestor = labels.length > 2;
            const expansionAncestorID = `${labels[0]}-id`;
            expansionAncestor = this.model.getNode(expansionAncestorID) as ExpandableTreeNode;
            if (hasSubgroupAncestor) {
                const subgroupID = labels.slice(0, 2).join('.') + '-id';
                selectionAncestor = this.model.getNode(subgroupID) as SelectableTreeNode;
            } else {
                // The last selectable child that precedes the visible item alphabetically
                selectionAncestor = [...(expansionAncestor?.children || [])]
                    .reverse().find(child => child.visible && child.id < visibleNodeID) as SelectableTreeNode || expansionAncestor;
            }
        }
        return { selectionAncestor, expansionAncestor };
    }

    protected onAfterAttach(msg: Message): void {
        this.updateDisplay();
        this.model.onSelectionChanged(previousAndCurrentSelectedNodes => this.fireEditorScrollForNewSelection(previousAndCurrentSelectedNodes));
        super.onAfterAttach(msg);
    }

    protected updateDisplay(): void {
        if (this.preferenceTreeProvider) {
            this.model.root = this.preferenceTreeProvider.currentTree;
            const nodes = Object.keys(this.preferenceTreeProvider.propertyList)
                .map(propertyName => ({ [propertyName]: this.preferenceTreeProvider.propertyList[propertyName] }));
            this.decorator.fireDidChangeDecorations(nodes);
            // If the tree has changed but we know the visible node, scroll to it.
            if (this.firstVisibleLeafNodeID) {
                const { selectionAncestor } = this.getAncestorsForVisibleNode(this.firstVisibleLeafNodeID);
                if (selectionAncestor?.visible) {
                    this.preferencesEventService.onNavTreeSelection.fire({ nodeID: this.firstVisibleLeafNodeID });
                }
            }
            this.update();
        }
    }

    protected fireEditorScrollForNewSelection(previousAndCurrentSelectedNodes: readonly SelectableTreeNode[]): void {
        if (this.shouldFireSelectionEvents) {
            const [currentSelectedNode] = previousAndCurrentSelectedNodes;
            this.firstVisibleLeafNodeID = currentSelectedNode.id;
            this.preferencesEventService.onNavTreeSelection.fire({ nodeID: currentSelectedNode.id });
        }
    }

    protected renderNode(node: TreeNode, props: NodeProps): React.ReactNode {
        if (!TreeNode.isVisible(node)) {
            return undefined;
        }

        const attributes = this.createNodeAttributes(node, props);
        const name = this.labelProvider.getName(node);
        const printedNameWithVisibleChildren = name && this.preferenceTreeProvider.isFiltered
            ? `${name} (${this.calculateVisibleLeaves(node)})`
            : name;

        const content = <div className={TREE_NODE_CONTENT_CLASS}>
            {this.renderExpansionToggle(node, props)}
            {this.renderCaption({ ...node, name: printedNameWithVisibleChildren }, props)}
        </div>;
        return React.createElement('div', attributes, content);
    }

    protected calculateVisibleLeaves(node: Preference.TreeExtension): number {
        let visibleLeaves = 0;
        // The check for node.name prevents recursion at the level of `root`.
        if (node.children) {
            node.children.forEach(child => {
                visibleLeaves += this.calculateVisibleLeaves(child);
            });
        }
        if (node.leaves) {
            node.leaves.forEach(leaf => {
                if (leaf.visible) {
                    visibleLeaves++;
                };
            });
        }
        return visibleLeaves;
    }

    protected renderExpansionToggle(node: Preference.TreeExtension, props: NodeProps): React.ReactNode {
        if (node.children && node.children.every(child => !child.visible)) {
            return <div className='preferences-tree-spacer' />;
        }
        return super.renderExpansionToggle(node, props);
    }
}
