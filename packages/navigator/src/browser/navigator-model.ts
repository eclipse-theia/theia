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

import { injectable, inject, postConstruct } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { FileNode, FileTreeModel } from '@theia/filesystem/lib/browser';
import { TreeIterator, Iterators } from '@theia/core/lib/browser/tree/tree-iterator';
import { OpenerService, open, TreeNode, ExpandableTreeNode } from '@theia/core/lib/browser';
import { FileNavigatorTree, WorkspaceRootNode, WorkspaceNode } from './navigator-tree';
import { FileNavigatorSearch } from './navigator-search';
import { WorkspaceService } from '@theia/workspace/lib/browser';

@injectable()
export class FileNavigatorModel extends FileTreeModel {

    @inject(OpenerService) protected readonly openerService: OpenerService;
    @inject(FileNavigatorTree) protected readonly tree: FileNavigatorTree;
    @inject(FileNavigatorSearch) protected readonly navigatorSearch: FileNavigatorSearch;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;

    @postConstruct()
    protected async init(): Promise<void> {
        this.toDispose.push(
            this.workspaceService.onWorkspaceChanged(event => {
                this.updateRoot();
            })
        );
        super.init();
    }

    protected doOpenNode(node: TreeNode): void {
        if (FileNode.is(node)) {
            open(this.openerService, node.uri);
        } else {
            super.doOpenNode(node);
        }
    }

    *getNodesByUri(nodeUri: URI): IterableIterator<TreeNode> {
        const workspace = this.root;
        if (WorkspaceNode.is(workspace)) {
            for (const root of workspace.children) {
                const id = WorkspaceRootNode.createId(root, nodeUri);
                const node = this.getNode(id);
                if (node) {
                    yield node;
                }
            }
        }
    }

    async updateRoot(): Promise<void> {
        this.root = await this.createRoot();
    }

    protected async createRoot(): Promise<TreeNode | undefined> {
        const roots = await this.workspaceService.roots;
        if (roots.length > 0) {
            const workspaceNode = WorkspaceNode.createRoot();
            for (const root of roots) {
                workspaceNode.children.push(
                    await this.tree.createWorkspaceRoot(root, workspaceNode)
                );
            }
            return workspaceNode;
        }
    }

    /**
     * Move the given source file or directory to the given target directory.
     */
    async move(source: TreeNode, target: TreeNode) {
        if (source.parent && WorkspaceRootNode.is(source)) {
            // do not support moving a root folder
            return;
        }
        await super.move(source, target);
    }

    /**
     * Reveals node in the navigator by given file uri.
     *
     * @param targetFileUri uri to file which should be revealed in the navigator
     * @returns file tree node if the file with given uri was revealed, undefined otherwise
     */
    async revealFile(targetFileUri: URI): Promise<TreeNode | undefined> {
        if (targetFileUri.scheme !== 'file') {
            return undefined;
        }

        let node = await this.getNodeClosestToRootByUri(targetFileUri);

        // success stop condition
        // we have to reach workspace root because expanded node could be inside collapsed one
        if (WorkspaceRootNode.is(node)) {
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
                node = await this.getNodeClosestToRootByUri(targetFileUri);
            }
            if (ExpandableTreeNode.is(node) && !node.expanded) {
                await this.expandNode(node);
            }
            return node;
        }
        return undefined;
    }

    protected getNodeClosestToRootByUri(uri: URI): TreeNode | undefined {
        const nodes = [...this.getNodesByUri(uri)];
        return nodes.length > 0
            ? nodes.reduce((node1, node2) => // return the node closest to the workspace root
                node1.id.length >= node2.id.length ? node1 : node2
            ) : undefined;
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
