/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { OpenerService, open, TreeNode } from "@theia/core/lib/browser";
import { FileNode, FileTreeModel } from "@theia/filesystem/lib/browser";
import { FileNavigatorTree } from "./navigator-tree";

@injectable()
export class FileNavigatorModel extends FileTreeModel {

    @inject(OpenerService) protected readonly openerService: OpenerService;
    @inject(FileNavigatorTree) protected readonly tree: FileNavigatorTree;

    protected doOpenNode(node: TreeNode): void {
        if (FileNode.is(node)) {
            open(this.openerService, node.uri);
        } else {
            super.doOpenNode(node);
        }
    }

}
