/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { ITreeNode } from "../../../application/browser";
import { DirNode, FileTreeModel } from '../../../navigator/browser/file-tree';

@injectable()
export class FileDialogModel extends FileTreeModel {

    protected doOpenNode(node: ITreeNode): void {
        if (DirNode.is(node)) {
            this.navigateTo(node);
        } else {
            super.doOpenNode(node);
        }
    }

}