/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import URI from '../../../application/common/uri';
import { ITreeNode, ICompositeTreeNode, ISelectableTreeNode, IExpandableTreeNode, Tree } from "../../../application/browser";
import { FileSystem, FileStat, UriSelection } from "../../../filesystem/common";

@injectable()
export class FileTree extends Tree {

    constructor( @inject(FileSystem) protected readonly fileSystem: FileSystem) {
        super();
    }

    resolveChildren(parent: ICompositeTreeNode): Promise<ITreeNode[]> {
        if (FileStatNode.is(parent)) {
            return this.resolveFileStat(parent).then(fileStat =>
                this.toNodes(fileStat, parent)
            )
        }
        return super.resolveChildren(parent);
    }

    protected resolveFileStat(node: FileStatNode): Promise<FileStat> {
        return this.fileSystem.getFileStat(node.fileStat.uri).then(fileStat => {
            node.fileStat = fileStat;
            return fileStat;
        });
    }

    protected toNodes(fileStat: FileStat, parent: ICompositeTreeNode): ITreeNode[] {
        if (!fileStat.children) {
            return [];
        }
        return fileStat.children.map(child =>
            this.toNode(child, parent)
        ).sort(DirNode.compare);
    }

    protected toNode(fileStat: FileStat, parent: ICompositeTreeNode): FileNode | DirNode {
        const uri = new URI(fileStat.uri)
        const id = fileStat.uri;
        const node = this.getNode(id);
        if (fileStat.isDirectory) {
            if (DirNode.is(node)) {
                node.fileStat = fileStat;
                return node;
            }
            const name = uri.displayName;
            return <DirNode>{
                id, uri, fileStat, name, parent,
                expanded: false,
                selected: false,
                children: []
            }
        }
        if (FileNode.is(node)) {
            node.fileStat = fileStat;
            return node;
        }
        const name = uri.displayName;
        return <FileNode>{
            id, uri, fileStat, name, parent,
            selected: false
        }
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

    export function createRoot(fileStat: FileStat): DirNode {
        const uri = new URI(fileStat.uri)
        const id = fileStat.uri;
        return {
            id, uri, fileStat,
            name: uri.displayName,
            visible: true,
            parent: undefined,
            children: [],
            expanded: true,
            selected: false
        }
    }
}
