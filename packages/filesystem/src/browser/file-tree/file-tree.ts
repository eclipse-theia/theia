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

import { injectable, inject } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { TreeNode, CompositeTreeNode, SelectableTreeNode, ExpandableTreeNode, TreeImpl } from '@theia/core/lib/browser';
import { Mutable } from '@theia/core/lib/common/types';
import { FileStat, Stat, FileType, FileOperationError, FileOperationResult } from '../../common/files';
import { FileStat as DeprecatedFileStat } from '../../common/filesystem';
import { UriSelection } from '@theia/core/lib/common/selection';
import { MessageService } from '@theia/core/lib/common/message-service';
import { FileSelection } from '../file-selection';
import { FileService } from '../file-service';

@injectable()
export class FileTree extends TreeImpl {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(MessageService)
    protected readonly messagingService: MessageService;

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

    protected async resolveFileStat(node: FileStatNode): Promise<FileStat | undefined> {
        try {
            const fileStat = await this.fileService.resolve(node.uri);
            node.fileStat = fileStat;
            return fileStat;
        } catch (e) {
            if (!(e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND)) {
                this.messagingService.error(e.message);
            }
            return undefined;
        }
    }

    protected async toNodes(fileStat: FileStat, parent: CompositeTreeNode): Promise<TreeNode[]> {
        if (!fileStat.children) {
            return [];
        }
        const result = await Promise.all(fileStat.children.map(async child =>
            this.toNode(child, parent)
        ));
        return result.sort(DirNode.compare);
    }

    protected toNode(fileStat: FileStat, parent: CompositeTreeNode): FileNode | DirNode {
        const uri = fileStat.resource;
        const id = this.toNodeId(uri, parent);
        const node = this.getNode(id);
        if (fileStat.isDirectory) {
            if (DirNode.is(node)) {
                node.fileStat = fileStat;
                return node;
            }
            return <DirNode>{
                id, uri, fileStat, parent,
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
            id, uri, fileStat, parent,
            selected: false
        };
    }

    protected toNodeId(uri: URI, parent: CompositeTreeNode): string {
        return uri.path.toString();
    }
}

export interface FileStatNode extends SelectableTreeNode, Mutable<UriSelection>, FileSelection {
}
export namespace FileStatNode {
    export function is(node: object | undefined): node is FileStatNode {
        return !!node && 'fileStat' in node;
    }

    export function getUri(node: TreeNode | undefined): string | undefined {
        if (is(node)) {
            return node.fileStat.resource.toString();
        }
        return undefined;
    }
}

export type FileStatNodeData = Omit<FileStatNode, 'uri' | 'fileStat'> & {
    uri: string
    stat?: Stat | { type: FileType } & Partial<Stat>
    fileStat?: DeprecatedFileStat
};
export namespace FileStatNodeData {
    export function is(node: object | undefined): node is FileStatNodeData {
        return !!node && 'uri' in node && ('fileStat' in node || 'stat' in node);
    }
}

export type FileNode = FileStatNode;
export namespace FileNode {
    export function is(node: Object | undefined): node is FileNode {
        return FileStatNode.is(node) && !node.fileStat.isDirectory;
    }
}

export type DirNode = FileStatNode & ExpandableTreeNode;
export namespace DirNode {
    export function is(node: Object | undefined): node is DirNode {
        return FileStatNode.is(node) && node.fileStat.isDirectory;
    }

    export function compare(node: TreeNode, node2: TreeNode): number {
        return DirNode.dirCompare(node, node2) || uriCompare(node, node2);
    }

    export function uriCompare(node: TreeNode, node2: TreeNode): number {
        if (FileStatNode.is(node)) {
            if (FileStatNode.is(node2)) {
                return node.uri.displayName.localeCompare(node2.uri.displayName);
            }
            return 1;
        }
        if (FileStatNode.is(node2)) {
            return -1;
        }
        return 0;
    }

    export function dirCompare(node: TreeNode, node2: TreeNode): number {
        const a = DirNode.is(node) ? 1 : 0;
        const b = DirNode.is(node2) ? 1 : 0;
        return b - a;
    }

    export function createRoot(fileStat: FileStat): DirNode {
        const uri = fileStat.resource;
        const id = uri.toString();
        return {
            id, uri, fileStat,
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
