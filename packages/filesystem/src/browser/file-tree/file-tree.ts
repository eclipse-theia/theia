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

import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { TreeNode, CompositeTreeNode, SelectableTreeNode, ExpandableTreeNode, TreeImpl } from '@theia/core/lib/browser';
import { FileSystem, FileStat } from '../../common';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { UriSelection } from '@theia/core/lib/common/selection';
import { FileSelection } from '../file-selection';

@injectable()
export class FileTree extends TreeImpl {

    @inject(FileSystem) protected readonly fileSystem: FileSystem;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;

    async resolveChildren(parent: CompositeTreeNode): Promise<TreeNode[]> {
        if (FileStatNode.is(parent)) {
            const fileStat = await this.resolveFileStat(parent);
            if (fileStat) {
                return this.toNodes(fileStat, parent);
            }
            return [];
        }
        return super.resolveChildren(parent);
    }

    protected resolveFileStat(node: FileStatNode): Promise<FileStat | undefined> {
        return this.fileSystem.getFileStat(node.fileStat.uri).then(fileStat => {
            if (fileStat) {
                node.fileStat = fileStat;
                return fileStat;
            }
            return undefined;
        });
    }

    protected async toNodes(fileStat: FileStat, parent: CompositeTreeNode): Promise<TreeNode[]> {
        if (!fileStat.children) {
            return [];
        }
        const result = await Promise.all(fileStat.children.map(async child =>
            await this.toNode(child, parent)
        ));
        return result.sort(DirNode.compare);
    }

    protected async toNode(fileStat: FileStat, parent: CompositeTreeNode): Promise<FileNode | DirNode> {
        const uri = new URI(fileStat.uri);
        const name = await this.labelProvider.getName(uri);
        const icon = await this.labelProvider.getIcon(fileStat);
        const id = this.toNodeId(uri, parent);
        const node = this.getNode(id);
        if (fileStat.isDirectory) {
            if (DirNode.is(node)) {
                node.fileStat = fileStat;
                return node;
            }
            return <DirNode>{
                id, uri, fileStat, name, icon, parent,
                expanded: false,
                selected: false,
                children: []
            };
        }
        if (FileNode.is(node)) {
            node.fileStat = fileStat;
            return node;
        }
        return <FileNode>{
            id, uri, fileStat, name, icon, parent,
            selected: false
        };
    }

    protected toNodeId(uri: URI, parent: CompositeTreeNode): string {
        return uri.path.toString();
    }
}

export interface FileStatNode extends SelectableTreeNode, UriSelection, FileSelection {
}
export namespace FileStatNode {
    export function is(node: object | undefined): node is FileStatNode {
        return !!node && 'fileStat' in node;
    }

    export function getUri(node: TreeNode | undefined): string | undefined {
        if (is(node)) {
            return node.fileStat.uri;
        }
        return undefined;
    }
}

export type FileNode = FileStatNode;
export namespace FileNode {
    export function is(node: TreeNode | undefined): node is FileNode {
        return FileStatNode.is(node) && !node.fileStat.isDirectory;
    }
}

export type DirNode = FileStatNode & ExpandableTreeNode;
export namespace DirNode {
    export function is(node: TreeNode | undefined): node is DirNode {
        return FileStatNode.is(node) && node.fileStat.isDirectory;
    }

    export function compare(node: TreeNode, node2: TreeNode): number {
        return DirNode.dirCompare(node, node2) || node.name.localeCompare(node2.name);
    }

    export function dirCompare(node: TreeNode, node2: TreeNode): number {
        const a = DirNode.is(node) ? 1 : 0;
        const b = DirNode.is(node2) ? 1 : 0;
        return b - a;
    }

    export function createRoot(fileStat: FileStat, name: string, icon: string): DirNode {
        const uri = new URI(fileStat.uri);
        const id = fileStat.uri;
        return {
            id, uri, fileStat,
            name,
            icon,
            visible: true,
            parent: undefined,
            children: [],
            expanded: true,
            selected: false
        };
    }

    export function getContainingDir(node: TreeNode | undefined): DirNode | undefined {
        let containing = node;
        while (!!containing && !is(containing)) {
            containing = containing.parent;
        }
        return containing;
    }
}
