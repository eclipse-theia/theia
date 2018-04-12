/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { FileNode, FileTreeModel, FileStatNode } from '@theia/filesystem/lib/browser';
import { TreeIterator, Iterators } from '@theia/core/lib/browser/tree/tree-iterator';
import { OpenerService, open, TreeNode, ExpandableTreeNode, CompositeTreeNode } from '@theia/core/lib/browser';
import { FileNavigatorTree } from './navigator-tree';
import { FileNavigatorSearch } from './navigator-search';

@injectable()
export class FileNavigatorModel extends FileTreeModel {

    @inject(OpenerService) protected readonly openerService: OpenerService;
    @inject(FileNavigatorTree) public readonly tree: FileNavigatorTree;
    @inject(FileNavigatorSearch) protected readonly navigatorSearch: FileNavigatorSearch;
    _hasMultipleRoots: boolean = false;

    get hasMultipleRoots() {
        return this._hasMultipleRoots;
    }

    set hasMultipleRoots(multipleRoots: boolean) {
        this._hasMultipleRoots = multipleRoots;
        this.tree.hasVirtualRoot = multipleRoots;
    }

    protected doOpenNode(node: TreeNode): void {
        if (FileNode.is(node)) {
            open(this.openerService, node.uri);
        } else {
            super.doOpenNode(node);
        }
    }

    /**
     * Reveals node in the navigator by given file uri.
     *
     * @param targetFileUri uri to file which should be revealed in the navigator
     * @returns file tree node if the file with given uri was revealed, undefined otherwise
     */
    async revealFile(targetFileUri: URI): Promise<TreeNode | undefined> {
        const navigatorNodeId = targetFileUri.toString();
        let node = this.getNodeClosestToRootByUri(navigatorNodeId);

        // success stop condition
        // we have to reach workspace root because expanded node could be inside collapsed one
        if (this.isProjectRoot(node)) {
            if (ExpandableTreeNode.is(node)) {
                if (!node.expanded) {
                    await this.expandNode(node);
                }
                return node;
            }
            // shouldn't happen, root node is always directory, i.e. expandable
            return undefined;
        }

        // fail stop condition
        if (targetFileUri.path.isRoot) {
            // file system root is reached but workspace root wasn't found, it means that
            // given uri is not in workspace root folder or points to not existing file.
            return undefined;
        }

        if (await this.revealFile(targetFileUri.parent)) {
            if (node === undefined) {
                // get node if it wasn't mounted into navigator tree before expansion
                node = this.getNodeClosestToRootByUri(navigatorNodeId);
            }
            if (ExpandableTreeNode.is(node) && !node.expanded) {
                await this.expandNode(node);
            }
            return node;
        }
        return undefined;
    }

    protected getNodeClosestToRootByUri(uri: string): TreeNode | undefined {
        const nodes = this.getNodes((node: FileStatNode) =>
            node.uri.toString() === uri
        );
        return nodes.length > 0
            ? nodes.reduce((node1, node2) => // return the node closest to the workspace root
                node1.id.length <= node2.id.length ? node1 : node2
            )
            : undefined;
    }

    protected isProjectRoot(node: TreeNode | undefined): boolean {
        if (!this.hasMultipleRoots && this.root === node) {
            return true;
        }
        if (node && this.hasMultipleRoots && CompositeTreeNode.is(this.root)) {
            return this.root.children.some(child => child.id === node.id);
        }
        return false;
    }

    protected createBackwardIterator(node: TreeNode | undefined): TreeIterator | undefined {
        if (node === undefined) {
            return undefined;
        }
        const { filteredNodes } = this.navigatorSearch;
        if (filteredNodes.length === 0) {
            return super.createBackwardIterator(node);
        }
        if (filteredNodes.indexOf(node) === -1) {
            return undefined;
        }
        return Iterators.cycle(filteredNodes.slice().reverse(), node);
    }

    protected createIterator(node: TreeNode | undefined): TreeIterator | undefined {
        if (node === undefined) {
            return undefined;
        }
        const { filteredNodes } = this.navigatorSearch;
        if (filteredNodes.length === 0) {
            return super.createIterator(node);
        }
        if (filteredNodes.indexOf(node) === -1) {
            return undefined;
        }
        return Iterators.cycle(filteredNodes, node);
    }

}
