/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import URI from '../../application/common/uri';
import { OpenerService, open } from "../../application/browser";
import { FileSystem, FileSystemWatcher, FileChangesEvent, FileChangeType } from "../../filesystem/common";
import { ITree, ITreeSelectionService, ITreeExpansionService, ITreeNode, ICompositeTreeNode, TreeModel } from "./tree";
import { FileStatNode, DirNode, FileNode } from "./navigator-tree";

@injectable()
export class FileNavigatorModel extends TreeModel {

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileSystemWatcher) watcher: FileSystemWatcher,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(ITree) tree: ITree,
        @inject(ITreeSelectionService) selection: ITreeSelectionService,
        @inject(ITreeExpansionService) expansion: ITreeExpansionService
    ) {
        super(tree, selection, expansion);
        this.toDispose.push(watcher.onFileChanges(event => this.onFileChanges(event)));
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
            open(this.openerService, node.uri);
        } else {
            super.doOpenNode(node);
        }
    }
}
