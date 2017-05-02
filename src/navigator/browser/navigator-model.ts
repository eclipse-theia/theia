/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { FileSystem, FileStat, FileChangesEvent, FileChangeType } from "../../filesystem/common/filesystem";
import { FileSystemWatcher } from "../../filesystem/common/filesystem-watcher";
import { UriSelection } from "../../filesystem/common/filesystem-selection";
import { SelectionService } from '../../application/common';
import { OpenerService } from "../../application/browser";
import {
    ITree,
    ITreeSelectionService,
    ITreeExpansionService,
    ITreeNode,
    ICompositeTreeNode,
    IExpandableTreeNode,
    TreeModel,
    Tree
} from "./tree";
import { ISelectableTreeNode } from "./tree/tree-selection";
import URI from '../../application/common/uri';

@injectable()
export class FileNavigatorModel extends TreeModel {

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileSystemWatcher) watcher: FileSystemWatcher,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(ITree) tree: ITree,
        @inject(ITreeSelectionService) selection: ITreeSelectionService,
        @inject(ITreeExpansionService) expansion: ITreeExpansionService,
        @inject(SelectionService) selectionService: SelectionService
    ) {
        super(tree, selection, expansion);
        this.toDispose.push(watcher.onFileChanges(event => this.onFileChanges(event)));
        this.toDispose.push(selection.onSelectionChanged(selection => selectionService.selection = selection));
    }

    get selectedFileStatNode(): Readonly<FileStatNode> | undefined {
        const selectedNode = this.selectedNode;
        if (FileStatNode.is(selectedNode)) {
            return selectedNode;
        }
        return undefined;
    }

    protected onFileChanges(event: FileChangesEvent): void {
        const affectedNodes = this.getAffectedNodes(event);
        if (affectedNodes.length !== 0) {
            affectedNodes.forEach(node => this.refresh(node));
        } else if (this.isRootAffected(event)) {
            this.refresh();
        }
    }

    protected isRootAffected(event: FileChangesEvent): boolean {
        const root = this.root;
        if (FileStatNode.is(root)) {
            return event.changes.some(change =>
                change.type < FileChangeType.DELETED && change.uri === root.fileStat.uri
            );
        }
        return false;
    }

    protected getAffectedNodes(event: FileChangesEvent): ICompositeTreeNode[] {
        const nodes: DirNode[] = [];
        for (const change of event.changes) {
            const uri = change.uri;
            const id = change.type > FileChangeType.UPDATED ? new URI(uri).parent.toString() : uri;
            const node = this.getNode(id);
            if (DirNode.is(node) && node.expanded) {
                nodes.push(node);
            }
        }
        return nodes;
    }

    protected doOpenNode(node: ITreeNode): void {
        if (FileNode.is(node)) {
            this.openerService.open<URI>(new URI(node.fileStat.uri));
        } else {
            super.doOpenNode(node);
        }
    }
}

@injectable()
export class FileNavigatorTree extends Tree {

    constructor( @inject(FileSystem) protected readonly fileSystem: FileSystem) {
        super();
        this.fileSystem.getWorkspaceRoot().then(fileStat => {
            this.root = this.createRootNode(fileStat);
        });
    }

    protected createRootNode(fileStat: FileStat): DirNode {
        const uri = fileStat.uri
        const id = uri;
        return {
            id, uri, fileStat,
            name: '/',
            visible: false,
            parent: undefined,
            children: [],
            expanded: true,
            selected: false
        }
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
        if (!node.fileStat.children && node.fileStat.isDirectory) {
            return this.fileSystem.getFileStat(node.fileStat.uri).then(fileStat => {
                node.fileStat = fileStat;
                return fileStat;
            });
        }
        return Promise.resolve(node.fileStat);
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
        const uri = fileStat.uri
        const id = uri;
        const node = this.getNode(id);
        if (fileStat.isDirectory) {
            if (DirNode.is(node)) {
                node.fileStat = fileStat;
                return node;
            }
            const name = new URI(fileStat.uri).lastSegment();
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
        const name = new URI(fileStat.uri).lastSegment();
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
        return FileStatNode.is(node) && !IExpandableTreeNode.is(node);
    }
}

export type DirNode = FileStatNode & IExpandableTreeNode;
export namespace DirNode {
    export function is(node: ITreeNode | undefined): node is DirNode {
        return FileStatNode.is(node) && IExpandableTreeNode.is(node);
    }

    export function compare(node: ITreeNode, node2: ITreeNode): number {
        return DirNode.dirCompare(node, node2) || node.name.localeCompare(node2.name);
    }

    export function dirCompare(node: ITreeNode, node2: ITreeNode): number {
        const a = DirNode.is(node) ? 1 : 0;
        const b = DirNode.is(node2) ? 1 : 0;
        return b - a;
    }
}
