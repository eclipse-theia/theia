/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { OpenerService, open } from "../../application/browser";
import { FileSystem, FileSystemWatcher } from "../../filesystem/common";
import { ITreeSelectionService, ITreeExpansionService, ITreeNode } from "./tree";
import { FileNode, FileTreeModel } from "./file-tree";
import { FileNavigatorTree } from "./navigator-tree";

@injectable()
export class FileNavigatorModel extends FileTreeModel {

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileSystemWatcher) protected readonly watcher: FileSystemWatcher,
        @inject(FileNavigatorTree) protected readonly tree: FileNavigatorTree,
        @inject(ITreeSelectionService) protected readonly selection: ITreeSelectionService,
        @inject(ITreeExpansionService) protected readonly expansion: ITreeExpansionService,
        @inject(OpenerService) protected readonly openerService: OpenerService
    ) {
        super(fileSystem, watcher, tree, selection, expansion);
    }

    protected doOpenNode(node: ITreeNode): void {
        if (FileNode.is(node)) {
            open(this.openerService, node.uri);
        } else {
            super.doOpenNode(node);
        }
    }

}
