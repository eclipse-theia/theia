/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, postConstruct } from "inversify";
import { Emitter, Event } from "@theia/core/lib/common";
import { TreeNode } from "@theia/core/lib/browser";
import { DirNode, FileNode, FileTreeModel, FileTree } from '../file-tree';

@injectable()
export class FileDialogModel extends FileTreeModel {

    @inject(FileTree) protected readonly tree: FileTree;
    protected readonly onDidOpenFileEmitter = new Emitter<void>();

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.onDidOpenFileEmitter);
    }

    get onDidOpenFile(): Event<void> {
        return this.onDidOpenFileEmitter.event;
    }

    protected doOpenNode(node: TreeNode): void {
        if (FileNode.is(node)) {
            this.onDidOpenFileEmitter.fire(undefined);
        } else if (DirNode.is(node)) {
            this.navigateTo(node);
        } else {
            super.doOpenNode(node);
        }
    }

}
