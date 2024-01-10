// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import '../../../../src/browser/tree/tree-compression/tree-compression.css';
import { injectable, inject } from 'inversify';
import * as React from 'react';
import { ArrayUtils } from '../../../common/types';
import { ContextMenuRenderer } from '../../context-menu-renderer';
import { CompressionToggle, TreeCompressionService } from './tree-compression-service';
import { CompositeTreeNode, TreeNode } from '../tree';
import { NodeProps, TreeProps, TreeWidget } from '../tree-widget';
import { SelectableTreeNode, TreeSelection } from '../tree-selection';
import { ExpandableTreeNode } from '../tree-expansion';
import { TreeViewWelcomeWidget } from '../tree-view-welcome-widget';
import { CompressedTreeModel } from './compressed-tree-model';

export interface CompressedChildren {
    compressionChain?: ArrayUtils.HeadAndTail<TreeNode>;
}

export interface CompressedNodeRow extends TreeWidget.NodeRow, CompressedChildren { }

export interface CompressedNodeProps extends NodeProps, CompressedChildren { }

@injectable()
export class CompressedTreeWidget extends TreeViewWelcomeWidget {

    @inject(CompressionToggle) protected readonly compressionToggle: CompressionToggle;
    @inject(TreeCompressionService) protected readonly compressionService: TreeCompressionService;

    constructor(
        @inject(TreeProps) props: TreeProps,
        @inject(CompressedTreeModel) override readonly model: CompressedTreeModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer,
    ) {
        super(props, model, contextMenuRenderer);
    }

    protected override rows = new Map<string, CompressedNodeRow>();

    toggleCompression(newCompression = !this.compressionToggle.compress): void {
        if (newCompression !== this.compressionToggle.compress) {
            this.compressionToggle.compress = newCompression;
            this.updateRows();
        }
    }

    protected override shouldRenderIndent(node: TreeNode): boolean {
        return !this.compressionToggle.compress
            || !this.compressionService.isCompressionParticipant(node)
            || this.compressionService.getCompressionHead(node) === node;
    }

    protected override shouldDisplayNode(node: TreeNode): boolean {
        if (this.compressionToggle.compress && this.compressionService.isCompressionParticipant(node) && !this.compressionService.isCompressionHead(node)) {
            return false;
        }
        return super.shouldDisplayNode(node);
    }

    protected override getDepthForNode(node: TreeNode, depths: Map<CompositeTreeNode | undefined, number>): number {
        if (!this.compressionToggle.compress) {
            return super.getDepthForNode(node, depths);
        }
        const parent = this.compressionService.getCompressionHead(node.parent) ?? node.parent;
        const parentDepth = depths.get(parent);
        return parentDepth === undefined ? 0 : TreeNode.isVisible(node.parent) ? parentDepth + 1 : parentDepth;
    }

    protected override toNodeRow(node: TreeNode, index: number, depth: number): CompressedNodeRow {
        if (!this.compressionToggle.compress) {
            return super.toNodeRow(node, index, depth);
        }
        const row: CompressedNodeRow = { node, index, depth };
        if (this.compressionService.isCompressionHead(node)) {
            row.compressionChain = this.compressionService.getCompressionChain(node);
        }
        return row;
    }

    protected override doRenderNodeRow({ node, depth, compressionChain }: CompressedNodeRow): React.ReactNode {
        const nodeProps: CompressedNodeProps = { depth, compressionChain };
        return <>
            {this.renderIndent(node, nodeProps)}
            {this.renderNode(node, nodeProps)}
        </>;
    }

    protected override rowIsSelected(node: TreeNode, props: CompressedNodeProps): boolean {
        if (this.compressionToggle.compress && props.compressionChain) {
            return props.compressionChain.some(participant => SelectableTreeNode.isSelected(participant));
        }
        return SelectableTreeNode.isSelected(node);
    }

    protected override getCaptionAttributes(node: TreeNode, props: CompressedNodeProps): React.Attributes & React.HTMLAttributes<HTMLElement> {
        const operativeNode = props.compressionChain?.tail() ?? node;
        return super.getCaptionAttributes(operativeNode, props);
    }

    protected override getCaptionChildren(node: TreeNode, props: CompressedNodeProps): React.ReactNode {
        if (!this.compressionToggle.compress || !props.compressionChain) {
            return super.getCaptionChildren(node, props);
        }
        return props.compressionChain.map((subNode, index, self) => {
            const classes = ['theia-tree-compressed-label-part'];
            if (SelectableTreeNode.isSelected(subNode)) {
                classes.push('theia-tree-compressed-selected');
            }
            const handlers = this.getCaptionChildEventHandlers(subNode, props);
            const caption = <span className={classes.join(' ')} key={subNode.id} {...handlers}>{super.getCaptionChildren(subNode, props)}</span>;
            if (index === self.length - 1) {
                return caption;
            }
            return [
                caption,
                <span className='theia-tree-compressed-label-separator' key={subNode + '-separator'}>{this.getSeparatorContent(node, props)}</span>
            ];
        });
    }

    protected getCaptionChildEventHandlers(node: TreeNode, props: CompressedNodeProps): React.Attributes & React.HtmlHTMLAttributes<HTMLElement> {
        return {
            onClick: event => (event.stopPropagation(), this.handleClickEvent(node, event)),
            onDoubleClick: event => (event.stopPropagation(), this.handleDblClickEvent(node, event)),
            onContextMenu: event => (event.stopPropagation(), this.handleContextMenuEvent(node, event)),
        };
    }

    protected override handleUp(event: KeyboardEvent): void {
        if (!this.compressionToggle.compress) {
            return super.handleUp(event);
        }
        const type = this.props.multiSelect && this.hasShiftMask(event) ? TreeSelection.SelectionType.RANGE : undefined;
        this.model.selectPrevRow(type);
        this.node.focus();
    }

    protected override handleDown(event: KeyboardEvent): void {
        if (!this.compressionToggle.compress) {
            return super.handleDown(event);
        }
        const type = this.props.multiSelect && this.hasShiftMask(event) ? TreeSelection.SelectionType.RANGE : undefined;
        this.model.selectNextRow(type);
        this.node.focus();
    }

    protected override async handleLeft(event: KeyboardEvent): Promise<void> {
        if (!this.compressionToggle.compress) {
            return super.handleLeft(event);
        }
        if (Boolean(this.props.multiSelect) && (this.hasCtrlCmdMask(event) || this.hasShiftMask(event))) {
            return;
        }
        const active = this.focusService.focusedNode;
        if (ExpandableTreeNode.isExpanded(active)
            && (
                this.compressionService.isCompressionHead(active)
                || !this.compressionService.isCompressionParticipant(active)
            )) {
            await this.model.collapseNode(active);
        } else {
            this.model.selectParent();
        }
    }

    protected override async handleRight(event: KeyboardEvent): Promise<void> {
        if (!this.compressionToggle.compress) {
            return super.handleRight(event);
        }
        if (Boolean(this.props.multiSelect) && (this.hasCtrlCmdMask(event) || this.hasShiftMask(event))) {
            return;
        }
        const active = this.focusService.focusedNode;

        if (ExpandableTreeNode.isCollapsed(active)
            && (
                !this.compressionService.isCompressionParticipant(active)
                || this.compressionService.isCompressionTail(active)
            )) {
            await this.model.expandNode(active);
        } else if (ExpandableTreeNode.is(active)) {
            this.model.selectNextNode();
        }
    }

    protected getSeparatorContent(node: TreeNode, props: CompressedNodeProps): React.ReactNode {
        return '/';
    }
}
