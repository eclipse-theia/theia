/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { OpenerService, open, ITreeNode } from "../../application/browser";
import { FileNode, FileTreeModel, FileTreeServices } from "../../filesystem/browser";
import { FileNavigatorTree } from "./navigator-tree";

@injectable()
export class FileNavigatorServices extends FileTreeServices {
    @inject(OpenerService) readonly openerService: OpenerService;
}

@injectable()
export class FileNavigatorModel extends FileTreeModel {

    protected readonly openerService: OpenerService;

    constructor(
        @inject(FileNavigatorTree) protected readonly tree: FileNavigatorTree,
        @inject(FileNavigatorServices) services: FileNavigatorServices
    ) {
        super(tree, services);
    }

    protected doOpenNode(node: ITreeNode): void {
        if (FileNode.is(node)) {
            open(this.openerService, node.uri);
        } else {
            super.doOpenNode(node);
        }
    }

}
