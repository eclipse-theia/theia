/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
import { DisposableCollection, Disposable } from '@theia/core/lib/common/disposable';
import URI from '@theia/core/lib/common/uri';
import { UriSelection } from '@theia/core/lib/common/selection';
import { isCancelled } from '@theia/core/lib/common/cancellation';
import { ContextMenuRenderer, NodeProps, TreeProps, TreeNode, CompositeTreeNode } from '@theia/core/lib/browser';
import { FileUploadService } from '../file-upload-service';
import { DirNode, FileStatNode, FileStatNodeData } from './file-tree';
import { FileTreeModel } from './file-tree-model';
import { IconThemeService } from '@theia/core/lib/browser/icon-theme-service';
import { FileStat, FileType } from '../../common/files';
import { CompressibleTreeWidget } from '@theia/core/lib/browser/compressible-tree/compressible-tree-widget';

export const FILE_TREE_CLASS = 'theia-FileTree';
export const FILE_STAT_NODE_CLASS = 'theia-FileStatNode';
export const DIR_NODE_CLASS = 'theia-DirNode';
export const FILE_STAT_ICON_CLASS = 'theia-FileStatIcon';

@injectable()
export class FileTreeWidget extends CompressibleTreeWidget {

    protected readonly toCancelNodeExpansion = new DisposableCollection();

    @inject(FileUploadService)
    protected readonly uploadService: FileUploadService;

    @inject(IconThemeService)
    protected readonly iconThemeService: IconThemeService;

    constructor(
        @inject(TreeProps) readonly props: TreeProps,
        @inject(FileTreeModel) readonly model: FileTreeModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer
    ) {
        super(props, model, contextMenuRenderer);
        this.addClass(FILE_TREE_CLASS);
        this.toDispose.push(this.toCancelNodeExpansion);
    }

    protected createNodeClassNames(node: TreeNode, props: NodeProps): string[] {
        const classNames = super.createNodeClassNames(node, props);
        if (FileStatNode.is(node)) {
            classNames.push(FILE_STAT_NODE_CLASS);
        }
        if (DirNode.is(node)) {
            classNames.push(DIR_NODE_CLASS);
        }
        return classNames;
    }

    protected renderIcon(node: TreeNode, props: NodeProps): React.ReactNode {
        const icon = this.toNodeIcon(node);
        if (icon) {
            return <div className={icon + ' file-icon'}></div>;
        }
        // eslint-disable-next-line no-null/no-null
        return null;
    }

    protected createContainerAttributes(): React.HTMLAttributes<HTMLElement> {
        const attrs = super.createContainerAttributes();
        return {
            ...attrs,
            onDragEnter: event => this.handleDragEnterEvent(this.model.root, event),
            onDragOver: event => this.handleDragOverEvent(this.model.root, event),
            onDragLeave: event => this.handleDragLeaveEvent(this.model.root, event),
            onDrop: event => this.handleDropEvent(this.model.root, event)
        };
    }

    protected createNodeAttributes(node: TreeNode, props: NodeProps): React.Attributes & React.HTMLAttributes<HTMLElement> {
        const elementAttrs = super.createNodeAttributes(node, props);
        return {
            ...elementAttrs,
            draggable: FileStatNode.is(node),
            onDragStart: event => this.handleDragStartEvent(node, event),
            onDragEnter: event => this.handleDragEnterEvent(node, event),
            onDragOver: event => this.handleDragOverEvent(node, event),
            onDragLeave: event => this.handleDragLeaveEvent(node, event),
            onDrop: event => this.handleDropEvent(node, event),
            title: this.getNodeTooltip(node)
        };
    }

    protected getNodeTooltip(node: TreeNode): string | undefined {
        const items = this.getCompressedItems(node);
        if (items.length > 0) {
            const lastCompressedItem = items[items.length - 1];
            node = lastCompressedItem;
        }
        const uri = UriSelection.getUri(node);
        return uri ? uri.path.toString() : undefined;
    }

    protected handleDragStartEvent(node: TreeNode, event: React.DragEvent): void {
        event.stopPropagation();
        let selectedNodes;
        if (this.model.selectedNodes.find(selected => TreeNode.equals(selected, node))) {
            selectedNodes = [...this.model.selectedNodes];
        } else {
            selectedNodes = [node];
        }
        this.setSelectedTreeNodesAsData(event.dataTransfer, node, selectedNodes);
        if (event.dataTransfer) {
            let label: string;
            if (selectedNodes.length === 1) {
                label = this.toNodeName(node);
            } else {
                label = String(selectedNodes.length);
            }
            const dragImage = document.createElement('div');
            dragImage.className = 'theia-file-tree-drag-image';
            dragImage.textContent = label;
            document.body.appendChild(dragImage);
            event.dataTransfer.setDragImage(dragImage, -10, -10);
            setTimeout(() => document.body.removeChild(dragImage), 0);
        }
    }

    protected handleDragEnterEvent(node: TreeNode | undefined, event: React.DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.toCancelNodeExpansion.dispose();
        const containing = DirNode.getContainingDir(node);
        if (!!containing && !containing.selected) {
            this.model.selectNode(containing);
        }
    }

    protected handleDragOverEvent(node: TreeNode | undefined, event: React.DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        if (!this.toCancelNodeExpansion.disposed) {
            return;
        }
        const timer = setTimeout(() => {
            const containing = DirNode.getContainingDir(node);
            if (!!containing && !containing.expanded) {
                this.model.expandNode(containing);
            }
        }, 500);
        this.toCancelNodeExpansion.push(Disposable.create(() => clearTimeout(timer)));
    }

    protected handleDragLeaveEvent(node: TreeNode | undefined, event: React.DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.toCancelNodeExpansion.dispose();
    }

    protected async handleDropEvent(node: TreeNode | undefined, event: React.DragEvent): Promise<void> {
        try {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
            const containing = this.getDropTargetDirNode(node);
            if (containing) {
                const resources = this.getSelectedTreeNodesFromData(event.dataTransfer);
                if (resources.length > 0) {
                    for (const treeNode of resources) {
                        await this.model.move(treeNode, containing);
                    }
                } else {
                    await this.uploadService.upload(containing.uri, { source: event.dataTransfer });
                }
            }
        } catch (e) {
            if (!isCancelled(e)) {
                console.error(e);
            }
        }
    }

    protected getDropTargetDirNode(node: TreeNode | undefined): DirNode | undefined {
        if (CompositeTreeNode.is(node) && node.id === 'WorkspaceNodeId') {
            if (node.children.length === 1) {
                return DirNode.getContainingDir(node.children[0]);
            } else if (node.children.length > 1) {
                // move file to the last root folder in multi-root scenario
                return DirNode.getContainingDir(node.children[node.children.length - 1]);
            }
        }
        return DirNode.getContainingDir(node);
    }

    protected setTreeNodeAsData(data: DataTransfer, node: TreeNode): void {
        data.setData('tree-node', node.id);
    }

    protected setSelectedTreeNodesAsData(data: DataTransfer, sourceNode: TreeNode, relatedNodes: TreeNode[]): void {
        this.setTreeNodeAsData(data, sourceNode);
        data.setData('selected-tree-nodes', JSON.stringify(relatedNodes.map(node => node.id)));
    }

    protected getTreeNodeFromData(data: DataTransfer): TreeNode | undefined {
        const id = data.getData('tree-node');
        return this.model.getNode(id);
    }
    protected getSelectedTreeNodesFromData(data: DataTransfer): TreeNode[] {
        const resources = data.getData('selected-tree-nodes');
        if (!resources) {
            return [];
        }
        const ids: string[] = JSON.parse(resources);
        return ids.map(id => this.model.getNode(id)).filter(node => node !== undefined) as TreeNode[];
    }

    protected get hidesExplorerArrows(): boolean {
        const theme = this.iconThemeService.getDefinition(this.iconThemeService.current);
        return !!theme && !!theme.hidesExplorerArrows;
    }

    protected renderExpansionToggle(node: TreeNode, props: NodeProps): React.ReactNode {
        if (this.hidesExplorerArrows) {
            // eslint-disable-next-line no-null/no-null
            return null;
        }
        return super.renderExpansionToggle(node, props);
    }

    protected getPaddingLeft(node: TreeNode, props: NodeProps): number {
        if (this.hidesExplorerArrows) {
            // additional left padding instead of top-level expansion toggle
            return super.getPaddingLeft(node, props) + this.props.leftPadding;
        }
        return super.getPaddingLeft(node, props);
    }

    protected needsExpansionTogglePadding(node: TreeNode): boolean {
        const theme = this.iconThemeService.getDefinition(this.iconThemeService.current);
        if (theme && (theme.hidesExplorerArrows || (theme.hasFileIcons && !theme.hasFolderIcons))) {
            return false;
        }
        return super.needsExpansionTogglePadding(node);
    }

    protected deflateForStorage(node: TreeNode): object {
        const deflated = super.deflateForStorage(node);
        if (FileStatNode.is(node) && FileStatNodeData.is(deflated)) {
            deflated.uri = node.uri.toString();
            delete deflated['fileStat'];
            deflated.stat = FileStat.toStat(node.fileStat);
        }
        return deflated;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected inflateFromStorage(node: any, parent?: TreeNode): TreeNode {
        if (FileStatNodeData.is(node)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fileStatNode: FileStatNode = node as any;
            const resource = new URI(node.uri);
            fileStatNode.uri = resource;
            let stat: typeof node['stat'];
            // in order to support deprecated FileStat
            if (node.fileStat) {
                stat = {
                    type: node.fileStat.isDirectory ? FileType.Directory : FileType.File,
                    mtime: node.fileStat.lastModification,
                    size: node.fileStat.size
                };
                delete node['fileStat'];
            } else if (node.stat) {
                stat = node.stat;
                delete node['stat'];
            }
            if (stat) {
                fileStatNode.fileStat = FileStat.fromStat(resource, stat);
            }
        }
        const inflated = super.inflateFromStorage(node, parent);
        if (DirNode.is(inflated)) {
            inflated.fileStat.children = [];
            for (const child of inflated.children) {
                if (FileStatNode.is(child)) {
                    inflated.fileStat.children.push(child.fileStat);
                }
            }
        }
        return inflated;
    }

    protected getCompressibleElement(node: TreeNode, compressedItem: TreeNode | undefined, index: number, children?: React.ReactNode[]): React.ReactElement {
        const element = super.getCompressibleElement(node, compressedItem, index, children);
        const currentItem = compressedItem || node;
        const props = {
            onDragStart: (event: React.DragEvent<Element>) => this.handleDragStartEvent(currentItem, event),
            onDragEnter: (event: React.DragEvent<Element>) => this.handleDragEnterEvent(currentItem, event),
            onDragOver: (event: React.DragEvent<Element>) => this.handleDragOverEvent(currentItem, event),
            onDragLeave: (event: React.DragEvent<Element>) => this.handleDragLeaveEvent(currentItem, event),
            onDrop: (event: React.DragEvent<Element>) => this.handleDropEvent(currentItem, event)
        };
        return React.cloneElement(element, props);
    }

}
