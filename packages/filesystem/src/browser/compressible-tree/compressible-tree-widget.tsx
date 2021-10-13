/********************************************************************************
 * Copyright (c) 2021 SAP SE or an SAP affiliate company and others.
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

import * as React from '@theia/core/shared/react';
import { injectable, inject } from '@theia/core/shared/inversify';
import {
    NodeProps, TreeNode, CompositeTreeNode, SelectableTreeNode, SELECTED_CLASS, ExpandableTreeNode,
    TreeCompressionService, CompressibleTreeNode, TreeSelection, TreeProps, ContextMenuRenderer, TreeViewWelcomeWidget
} from '@theia/core/lib/browser';
import { CompressibleTreeModel } from './compressible-tree-model';

export const COMPRESSED_CAPTION_SEPARATOR_CLASS = 'theia-CompressedCaptionSeparator';
export const COMPRESSED_CAPTION_SECTION_CLASS = 'theia-CompressedCaptionSection';

@injectable()
export class CompressibleTreeWidget extends TreeViewWelcomeWidget {

    @inject(TreeCompressionService)
    protected readonly compressionService: TreeCompressionService;

    constructor(
        @inject(TreeProps) readonly props: TreeProps,
        @inject(CompressibleTreeModel) readonly model: CompressibleTreeModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer
    ) {
        super(props, model, contextMenuRenderer);
        this.toDispose.push(this.model.onExpansionChanged(node => this.onExpansionChanged(node)));
    }

    protected onExpansionChanged(changedNode: Readonly<ExpandableTreeNode>): void {
        // update the item expansion according to the changedNode expansion, if not updated return false.
        const updateExpansion = (item: TreeNode): boolean => {
            if (ExpandableTreeNode.is(item)) {
                if (changedNode.expanded && !item.expanded) {
                    return !!this.model.expandNode(item);
                } else if (!changedNode.expanded && item.expanded) {
                    return !!this.model.collapseNode(item);
                }
            }
            return false;
        };
        // Searching for a compressed child that is not updated with the `node` expansion state and update it,
        // The update will cause the `onExpansionChanged` event to fire with the updated child and search again for a compressed child that need to be upadted,
        // And so on until all the compressed items in a raw will share the same expansion state...
        const updateCompressedExpansion = (node: CompositeTreeNode) => {
            let firstChild = node.children[0];
            while (CompressibleTreeNode.isCompressed(firstChild) && !updateExpansion(firstChild)) {
                firstChild = firstChild.children[0];
            }
        };

        // Ensure that all compressed items in a row share the same expansion state.
        // If `changedNode` is compressed, find its uncompressed parent and update expansion from there,
        // Otherwise start from the node itself.
        if (CompressibleTreeNode.isCompressed(changedNode)) {
            const uncompressedParent = CompressibleTreeNode.getUncompressedParent(changedNode);
            if (uncompressedParent) {
                if (!updateExpansion(uncompressedParent)) {
                    updateCompressedExpansion(uncompressedParent);
                };
            }
        } else {
            updateCompressedExpansion(changedNode);
        }
    }

    protected async handleLeft(event: KeyboardEvent): Promise<void> {
        if (this.isMutiSelectMaskEvent(event)) {
            return;
        }
        this.model.selectedNodes.forEach(async node => {
            let collapsed = false;
            // In a compressed tree row - collapse the node only when reaching the start item
            if (!CompressibleTreeNode.isCompressed(node) && ExpandableTreeNode.is(node)) {
                collapsed = !!await this.model.collapseNode(node);
            }
            if (!collapsed) {
                this.model.selectParent();
            }
        });
    }

    protected async handleRight(event: KeyboardEvent): Promise<void> {
        if (this.isMutiSelectMaskEvent(event)) {
            return;
        }
        this.model.selectedNodes.forEach(async node => {
            let expanded = false;
            // In a compressed tree row - expand the node only when reaching the last item
            if (!CompressibleTreeNode.hasCompressedItem(node) && ExpandableTreeNode.is(node)) {
                expanded = !!await this.model.expandNode(node);
            }
            if (!expanded) {
                this.model.selectNextNode();
            }
        });
    }

    protected handleUp(event: KeyboardEvent): void {
        if (!!this.props.multiSelect && this.hasShiftMask(event)) {
            this.model.selectPrevRow(TreeSelection.SelectionType.RANGE);
        } else {
            this.model.selectPrevRow();
        }
    }

    protected handleDown(event: KeyboardEvent): void {
        if (!!this.props.multiSelect && this.hasShiftMask(event)) {
            this.model.selectNextRow(TreeSelection.SelectionType.RANGE);
        } else {
            this.model.selectNextRow();
        }
    }

    protected createNodeClassNames(node: TreeNode, props: NodeProps): string[] {
        const classNames = super.createNodeClassNames(node, props);
        if (!classNames.includes(SELECTED_CLASS) && this.isCompressedItemSelected(node)) {
            classNames.push(SELECTED_CLASS);
        }
        return classNames;
    }

    // Handles the click event for a compressed node.
    protected handleClickEvent(node: TreeNode | undefined, event: React.MouseEvent<HTMLElement, MouseEvent>): void {
        let clickedNode: TreeNode | undefined;
        // Clicked on a specific part of the node caption, e.g: caption => 'aaa/bbb/ccc', user clicked on 'ccc'
        const compressedNodeId = event.currentTarget.getAttribute('compressed-node-id');
        if (compressedNodeId) {
            clickedNode = this.model.getNode(compressedNodeId);
        } else if (!CompressibleTreeNode.isCompressed(node) && !SelectableTreeNode.isSelected(node)) {
            // Clicked outside the node caption, e.g: expansion toggle or the empty section right after the caption.
            // Will handle the click for the already selected/last compressed child if there is one...
            const items = this.getCompressedItems(node);
            if (items.length > 0) {
                let selectedIndex = items.findIndex(item => SelectableTreeNode.isSelected(item));
                // Select the last compressed item if no item is selected
                selectedIndex = selectedIndex > -1 ? selectedIndex : items.length - 1;
                clickedNode = items[selectedIndex];
            }
        }
        super.handleClickEvent(clickedNode || node, event);
    }

    protected getScrollToRow(): number | undefined {
        if (!this.shouldScrollToRow) {
            return undefined;
        }
        const selected = this.model.selectedNodes;
        let node: TreeNode | undefined = selected.find(SelectableTreeNode.hasFocus) || selected[0];
        // If the node for scrolling is compressed - return its uncompressed parent.
        if (CompressibleTreeNode.isCompressed(node)) {
            node = CompressibleTreeNode.getUncompressedParent(node);
        }
        const row = node && this.rows.get(node.id);
        return row && row.index;
    }

    protected getParentDepth(node: TreeNode, depths: Map<CompositeTreeNode | undefined, number>): number | undefined {
        if (CompressibleTreeNode.isCompressed(node.parent)) {
            return depths.get(CompressibleTreeNode.getUncompressedParent(node));
        }
        return super.getParentDepth(node, depths);
    }

    protected shouldDisplayNode(node: TreeNode): boolean {
        return super.shouldDisplayNode(node) && !CompressibleTreeNode.isCompressed(node);
    }

    // Handles the context menu event for a compressed node if selected.
    protected handleContextMenuEvent(node: TreeNode | undefined, event: React.MouseEvent<HTMLElement>): void {
        let selectedNode: TreeNode | undefined;
        // If the event is handled by a node in a compressed tree row.
        const isCompressedNode = !!event.currentTarget.getAttribute('compressed-node-id');
        // In case user clicked on the area outside the label of the tree raw, the context menu event need to be handled for the selected compressed item.
        if (!isCompressedNode && !CompressibleTreeNode.isCompressed(node)) {
            const items = this.getCompressedItems(node);
            if (items.length > 0) {
                selectedNode = items.find(item => SelectableTreeNode.isSelected(item));
            }
        }
        super.handleContextMenuEvent(selectedNode || node, event);
    }

    protected needsActiveIndentGuideline(node: TreeNode): boolean {
        // Commpressed node has no indent for itself.
        if (CompressibleTreeNode.isCompressed(node)) {
            return false;
        }
        const parent = node.parent;
        if (!parent || !this.isExpandable(parent)) {
            return false;
        }
        if (SelectableTreeNode.isSelected(parent)) {
            return true;
        }
        // Return `true` if the uncompressed parent is selected or any of its compressed items.
        const uncompressedParent = CompressibleTreeNode.getUncompressedParent(node);
        if (this.isNodeOrCompressedItemSelected(uncompressedParent)) {
            return true;
        }
        if (ExpandableTreeNode.isExpanded(uncompressedParent)) {
            for (const sibling of parent.children) {
                if (this.isNodeOrCompressedItemSelected(sibling) && !ExpandableTreeNode.isExpanded(sibling)) {
                    return true;
                }
            }
        }
        return false;
    }

    protected isNodeOrCompressedItemSelected(node: TreeNode | undefined): boolean {
        if (!node) {
            return false;
        }
        return SelectableTreeNode.isSelected(node) || this.isCompressedItemSelected(node);
    }

    protected isCompressedItemSelected(node: TreeNode): boolean {
        return this.getCompressedItems(node).some(item => SelectableTreeNode.isSelected(item));
    }

    protected getCompressedItems(node: TreeNode | undefined): TreeNode[] {
        return this.compressionService.getItems(node);
    }

    protected renderCaptionNode(node: TreeNode): React.ReactNode[] {
        const captionNode: React.ReactNode[] = [];
        const comppressedItems = this.getCompressedItems(node);
        captionNode.push(
            this.toCompressibleHighlightNode(0, node)
        );
        if (comppressedItems.length > 0) {
            comppressedItems.forEach((item, idx) => {
                captionNode.push(
                    this.toCompressibleHighlightNode(idx + 1, node, item)
                );
            });
        }
        return captionNode;
    }

    protected toCompressibleHighlightNode(index: number, node: TreeNode, compressedItem?: TreeNode): React.ReactNode[] {
        const compressedNode: React.ReactNode[] = [];
        const currentItem = compressedItem || node;
        const highlight = this.getDecorationData(currentItem, 'highlight')[0];
        if (highlight) {
            const highlightNode = this.toReactNode(this.toNodeName(currentItem), highlight);
            compressedNode.push(
                this.toCompressibleNode(index, node, compressedItem, highlightNode)
            );
        }
        const searchHighlight = this.searchHighlights ? this.searchHighlights.get(currentItem.id) : undefined;
        if (searchHighlight) {
            const searchHighlightNode = this.toReactNode(this.toNodeName(currentItem), searchHighlight);
            compressedNode.push(
                this.toCompressibleNode(index, node, compressedItem, searchHighlightNode)
            );
        } else if (!highlight) {
            compressedNode.push(
                this.toCompressibleNode(index, node, compressedItem)
            );
        }
        return compressedNode;
    }

    protected toCompressibleNode(index: number, node: TreeNode, compressedItem?: TreeNode, children?: React.ReactNode[]): React.ReactNode[] {
        const compressedNode: React.ReactNode[] = [];
        if (compressedItem) {
            compressedNode.push(this.getSeparatorElement(index));
        }
        compressedNode.push(this.getCompressibleElement(node, compressedItem, index, children));
        return compressedNode;
    }

    protected getSeparatorElement(index: number): React.ReactNode {
        return <span className={COMPRESSED_CAPTION_SEPARATOR_CLASS} key={`seperator-${index}`}>/</span>;
    }

    protected getCompressibleElement(node: TreeNode, compressedItem: TreeNode | undefined, index: number, children?: React.ReactNode[]): React.ReactElement {
        const currentItem = compressedItem || node;
        // className and style should be applied only for a compressed row
        const isCompressedRow = compressedItem || CompressibleTreeNode.hasCompressedItem(node);
        const className = isCompressedRow ? COMPRESSED_CAPTION_SECTION_CLASS : '';
        const style = isCompressedRow && SelectableTreeNode.isSelected(currentItem) ? { textDecoration: 'underline' } : {};
        return <span
            compressed-node-id={currentItem.id}
            key={`${className}-${node.id}-${index}`}
            className={className}
            style={style}
            onContextMenu={event => this.handleContextMenuEvent(currentItem, event)}
            onClick={event => this.handleClickEvent(currentItem, event)}>
            {children || this.toNodeName(currentItem)}</span>;
    }

}
