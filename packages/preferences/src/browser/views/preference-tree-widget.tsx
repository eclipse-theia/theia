// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import {
    ExpandableTreeNode,
    TreeNode,
    TreeProps,
    TreeWidget,
    TREE_NODE_CONTENT_CLASS,
} from '@theia/core/lib/browser';
import React = require('@theia/core/shared/react');
import { PreferenceTreeModel, PreferenceTreeNodeRow, PreferenceTreeNodeProps } from '../preference-tree-model';
import { Preference } from '../util/preference-types';

@injectable()
export class PreferencesTreeWidget extends TreeWidget {
    static ID = 'preferences.tree';

    protected shouldFireSelectionEvents: boolean = true;
    protected firstVisibleLeafNodeID: string;

    @inject(PreferenceTreeModel) override readonly model: PreferenceTreeModel;
    @inject(TreeProps) protected readonly treeProps: TreeProps;

    @postConstruct()
    override init(): void {
        super.init();
        this.id = PreferencesTreeWidget.ID;
        this.toDispose.pushAll([
            this.model.onFilterChanged(() => {
                this.updateRows();
            }),
        ]);
    }

    override doUpdateRows(): void {
        this.rows = new Map();
        let index = 0;
        for (const [id, nodeRow] of this.model.currentRows.entries()) {
            if (nodeRow.visibleChildren > 0 && this.isVisibleNode(nodeRow.node)) {
                this.rows.set(id, { ...nodeRow, index: index++ });
            }
        }
        this.updateScrollToRow();
    }

    protected isVisibleNode(node: Preference.TreeNode): boolean {
        if (Preference.TreeNode.isTopLevel(node)) {
            return true;
        } else {
            return ExpandableTreeNode.isExpanded(node.parent) && Preference.TreeNode.is(node.parent) && this.isVisibleNode(node.parent);
        }
    }

    protected override doRenderNodeRow({ depth, visibleChildren, node, isExpansible }: PreferenceTreeNodeRow): React.ReactNode {
        return this.renderNode(node, { depth, visibleChildren, isExpansible });
    }

    protected override renderNode(node: TreeNode, props: PreferenceTreeNodeProps): React.ReactNode {
        if (!TreeNode.isVisible(node)) {
            return undefined;
        }

        const attributes = this.createNodeAttributes(node, props);

        const content = <div className={TREE_NODE_CONTENT_CLASS}>
            {this.renderExpansionToggle(node, props)}
            {this.renderCaption(node, props)}
        </div>;
        return React.createElement('div', attributes, content);
    }

    protected override renderExpansionToggle(node: TreeNode, props: PreferenceTreeNodeProps): React.ReactNode {
        if (ExpandableTreeNode.is(node) && !props.isExpansible) {
            return <div className='preferences-tree-spacer' />;
        }
        return super.renderExpansionToggle(node, props);
    }

    protected override toNodeName(node: TreeNode): string {
        const visibleChildren = this.model.currentRows.get(node.id)?.visibleChildren;
        const baseName = this.labelProvider.getName(node);
        const printedNameWithVisibleChildren = this.model.isFiltered && visibleChildren !== undefined
            ? `${baseName} (${visibleChildren})`
            : baseName;
        return printedNameWithVisibleChildren;
    }
}
