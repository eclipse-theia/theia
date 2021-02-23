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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import {
    ContextMenuRenderer,
    ExpandableTreeNode,
    PreferenceService,
    TreeNode,
    TreeProps,
    TreeWidget,
    TREE_NODE_CONTENT_CLASS,
} from '@theia/core/lib/browser';
import { PreferenceConfigurations } from '@theia/core/lib/browser/preferences/preference-configurations';
import React = require('@theia/core/shared/react');
import { PreferenceTreeModel, PreferenceTreeNodeRow, PreferenceTreeNodeProps } from '../preference-tree-model';

@injectable()
export class PreferencesTreeWidget extends TreeWidget {
    static ID = 'preferences.tree';

    protected shouldFireSelectionEvents: boolean = true;
    protected firstVisibleLeafNodeID: string;

    @inject(PreferenceService) protected readonly preferenceService: PreferenceService;
    @inject(PreferenceConfigurations) protected readonly preferenceConfigs: PreferenceConfigurations;
    @inject(PreferenceTreeModel) readonly model: PreferenceTreeModel;
    @inject(TreeProps) protected readonly treeProps: TreeProps;
    @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer;

    @postConstruct()
    init(): void {
        super.init();
        this.id = PreferencesTreeWidget.ID;
        this.toDispose.pushAll([
            this.model.onFilterChanged(() => {
                this.updateRows();
            }),
        ]);
    }

    doUpdateRows(): void {
        this.rows = new Map();
        for (const [id, nodeRow] of this.model.currentRows.entries()) {
            if (nodeRow.visibleChildren > 0 && (ExpandableTreeNode.is(nodeRow.node) || ExpandableTreeNode.isExpanded(nodeRow.node.parent))) {
                this.rows.set(id, nodeRow);
            }
        }
        this.updateScrollToRow();
    }

    protected doRenderNodeRow({ depth, visibleChildren, node, isExpansible }: PreferenceTreeNodeRow): React.ReactNode {
        return this.renderNode(node, { depth, visibleChildren, isExpansible });
    }

    protected renderNode(node: TreeNode, props: PreferenceTreeNodeProps): React.ReactNode {
        if (!TreeNode.isVisible(node)) {
            return undefined;
        }

        const attributes = this.createNodeAttributes(node, props);
        const printedNameWithVisibleChildren = node.name && this.model.isFiltered
            ? `${node.name} (${props.visibleChildren})`
            : node.name;

        const content = <div className={TREE_NODE_CONTENT_CLASS}>
            {this.renderExpansionToggle(node, props)}
            {this.renderCaption({ ...node, name: printedNameWithVisibleChildren }, props)}
        </div>;
        return React.createElement('div', attributes, content);
    }

    protected renderExpansionToggle(node: TreeNode, props: PreferenceTreeNodeProps): React.ReactNode {
        if (ExpandableTreeNode.is(node) && !props.isExpansible) {
            return <div className='preferences-tree-spacer' />;
        }
        return super.renderExpansionToggle(node, props);
    }
}
