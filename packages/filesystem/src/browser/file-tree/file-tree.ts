/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import URI from '@theia/core/lib/common/uri';
import { ITreeNode, ICompositeTreeNode, ISelectableTreeNode, IExpandableTreeNode, Tree } from "@theia/core/lib/browser";
import { FileSystem, FileStat, UriSelection } from "../../common";
import { LabelProvider } from "@theia/core/lib/browser/label-provider";

@injectable()
export class FileTree extends Tree {

    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem) {
        super();
    }

    async resolveChildren(parent: ICompositeTreeNode): Promise<ITreeNode[]> {
        if (FileStatNode.is(parent)) {
            const fileStat = await this.resolveFileStat(parent);
            return this.toNodes(fileStat, parent);
        }
        return super.resolveChildren(parent);
    }

    protected resolveFileStat(node: FileStatNode): Promise<FileStat> {
        return this.fileSystem.getFileStat(node.fileStat.uri).then(fileStat => {
            node.fileStat = fileStat;
            return fileStat;
        });
    }

    protected async toNodes(fileStat: FileStat, parent: ICompositeTreeNode): Promise<ITreeNode[]> {
        if (!fileStat.children) {
            return [];
        }
        const result = await Promise.all(fileStat.children.map(async child =>
            await this.toNode(child, parent)
        ));
        return result.sort(DirNode.compare);
    }

    protected async toNode(fileStat: FileStat, parent: ICompositeTreeNode): Promise<FileNode | DirNode> {
        const uri = new URI(fileStat.uri);
        const name = await this.labelProvider.getName(uri);
        const icon = await this.labelProvider.getIcon(fileStat);
        const id = fileStat.uri;
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

}

export interface FileStatNode extends ISelectableTreeNode, UriSelection {
    fileStat: FileStat;
}
export namespace FileStatNode {
    export function is(node: ITreeNode | undefined): node is FileStatNode {
        return !!node && 'fileStat' in node;
    }
}

export type FileNode = FileStatNode;
export namespace FileNode {
    export function is(node: ITreeNode | undefined): node is FileNode {
        return FileStatNode.is(node) && !node.fileStat.isDirectory;
    }
}

export type DirNode = FileStatNode & IExpandableTreeNode;
export namespace DirNode {
    export function is(node: ITreeNode | undefined): node is DirNode {
        return FileStatNode.is(node) && node.fileStat.isDirectory;
    }

    export function compare(node: ITreeNode, node2: ITreeNode): number {
        return DirNode.dirCompare(node, node2) || node.name.localeCompare(node2.name);
    }

    export function dirCompare(node: ITreeNode, node2: ITreeNode): number {
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

    export function getContainingDir(node: ITreeNode | undefined): DirNode | undefined {
        let containing = node;
        while (!!containing && !is(containing)) {
            containing = containing.parent;
        }
        return containing;
    }
}
