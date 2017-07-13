/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import URI from '../../../application/common/uri';
import { ICompositeTreeNode, TreeModel, TreeServices } from "../../../application/browser";
import { FileSystem, FileSystemWatcher, FileChangeType, FileChange } from "../../../filesystem/common";
import { FileStatNode, DirNode, FileTree } from "./file-tree";
import { LocationService } from '../location';

@injectable()
export class FileTreeServices extends TreeServices {
    @inject(FileSystem) readonly fileSystem: FileSystem;
    @inject(FileSystemWatcher) readonly watcher: FileSystemWatcher;
}

@injectable()
export class FileTreeModel extends TreeModel implements LocationService {

    protected readonly fileSystem: FileSystem;
    protected readonly watcher: FileSystemWatcher;

    constructor(
        @inject(FileTree) protected readonly tree: FileTree,
        @inject(FileTreeServices) services: FileTreeServices
    ) {
        super(tree, services);
        this.toDispose.push(this.watcher.onFilesChanged(changes => this.onFilesChanged(changes)));
    }

    get location(): URI | undefined {
        const root = this.root;
        if (FileStatNode.is(root)) {
            return root.uri;
        }
        return undefined;
    }

    set location(uri: URI | undefined) {
        if (uri) {
            this.fileSystem.getFileStat(uri.toString()).then(fileStat => {
                const node = DirNode.createRoot(fileStat);
                this.navigateTo(node);
            });
        } else {
            this.navigateTo(undefined);
        }
    }

    get selectedFileStatNode(): Readonly<FileStatNode> | undefined {
        const selectedNode = this.selectedNode;
        if (FileStatNode.is(selectedNode)) {
            return selectedNode;
        }
        return undefined;
    }

    protected onFilesChanged(changes: FileChange[]): void {
        const affectedNodes = this.getAffectedNodes(changes);
        if (affectedNodes.length !== 0) {
            affectedNodes.forEach(node => this.refresh(node));
        } else if (this.isRootAffected(changes)) {
            this.refresh();
        }
    }

    protected isRootAffected(changes: FileChange[]): boolean {
        const root = this.root;
        if (FileStatNode.is(root)) {
            return changes.some(change =>
                change.type < FileChangeType.DELETED && change.uri.toString() === root.uri.toString()
            );
        }
        return false;
    }

    protected getAffectedNodes(changes: FileChange[]): ICompositeTreeNode[] {
        const nodes: DirNode[] = [];
        for (const change of changes) {
            const uri = change.uri;
            const id = change.type > FileChangeType.UPDATED ? uri.parent.toString() : uri.toString();
            const node = this.getNode(id);
            if (DirNode.is(node) && node.expanded) {
                nodes.push(node);
            }
        }
        return nodes;
    }

}
