/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Emitter, Event } from "../../../application/common";
import { ITreeNode } from "../../../application/browser";
import { DirNode, FileNode, FileTreeModel, FileTree, FileTreeServices } from '../../../filesystem/browser';

@injectable()
export class FileDialogModel extends FileTreeModel {

    protected readonly onDidOpenFileEmitter = new Emitter<void>();

    constructor(
        @inject(FileTree) protected readonly tree: FileTree,
        @inject(FileTreeServices) services: FileTreeServices
    ) {
        super(tree, services);
        this.toDispose.push(this.onDidOpenFileEmitter);
    }

    get onDidOpenFile(): Event<void> {
        return this.onDidOpenFileEmitter.event;
    }

    protected doOpenNode(node: ITreeNode): void {
        if (FileNode.is(node)) {
            this.onDidOpenFileEmitter.fire(undefined);
        } else if (DirNode.is(node)) {
            this.navigateTo(node);
        } else {
            super.doOpenNode(node);
        }
    }

}