/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { TreeNode, CompositeTreeNode, SelectableTreeNode, ExpandableTreeNode, TreeImpl } from '@theia/core/lib/browser';
import { FileSystem, FileStat } from '../../common';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { UriSelection } from '@theia/core/lib/common/selection';

@injectable()
export class FileTree extends TreeImpl {

    @inject(FileSystem) protected readonly fileSystem: FileSystem;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    hasVirtualRoot: boolean = false;

    async resolveChildren(parent: DirNode): Promise<TreeNode[]> {
        if (FileStatNode.is(parent)) {
            let fileStat;
            if (this.isVirtualRoot(parent)) {
                const root = parent as DirNode;
                fileStat = await this.resolveVirtualRootFileStat(root);
                if (fileStat) {
                    root.fileStat = fileStat;
                }
            } else {
                fileStat = await this.resolveFileStat(parent);
            }

            if (fileStat) {
                return this.toNodes(fileStat, parent);
            }
            return [];
        }
        return super.resolveChildren(parent);
    }

    protected resolveFileStat(node: DirNode): Promise<FileStat | undefined> {
        return this.fileSystem.getFileStat(node.fileStat.uri).then(fileStat => {
            if (fileStat) {
                node.fileStat = fileStat;
                return fileStat;
            }
            return undefined;
        });
    }

    protected async resolveVirtualRootFileStat(virtualRoot: DirNode): Promise<FileStat | undefined> {
        const rootFileStat = await this.fileSystem.getFileStat(virtualRoot.uri.toString());
        const children = virtualRoot.fileStat.children;
        let childrenFileStat: (FileStat | undefined)[] = [];
        if (children) {
            childrenFileStat = await Promise.all(children.map(child =>
                this.fileSystem.getFileStat(child.uri.toString())
            ));
        }
        if (rootFileStat) {
            rootFileStat.isDirectory = true;
            rootFileStat.children = [];
            for (const stat of childrenFileStat) {
                if (stat) {
                    rootFileStat.children.push(stat);
                }
            }
        }
        return rootFileStat;
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
        const id = this.generateFileTreeNodeId(name, fileStat.uri, parent);
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

    protected isVirtualRoot(node: CompositeTreeNode): boolean {
        return node.parent === undefined && this.hasVirtualRoot && node.name === 'WorkspaceRoot';
    }

    protected generateFileTreeNodeId(nodeName: string, uri: string, parent: CompositeTreeNode | undefined): string {
        if (parent && parent.name) {
            return this.generateFileTreeNodeId(`${parent.name}/${nodeName}`, uri, parent.parent);
        }
        return `${nodeName}///${uri}`;
    }
}

export interface FileStatNode extends SelectableTreeNode, UriSelection {
    fileStat: FileStat;
}
export namespace FileStatNode {
    export function is(node: TreeNode | undefined): node is FileStatNode {
        return !!node && 'fileStat' in node;
    }

    export function getUri(node: TreeNode | undefined): string {
        if (!node) {
            return '';
        }
        return node.id.slice(node.id.indexOf('file:///'));
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

    export function createWorkspaceRoot(workspace: FileStat, children: TreeNode[]): DirNode {
        const id = workspace.uri;
        const uri = new URI(id);
        return {
            id,
            uri,
            fileStat: workspace,
            name: 'WorkspaceRoot',
            parent: undefined,
            children,
            expanded: true,
            selected: false,
            focus: false,
            visible: false
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
