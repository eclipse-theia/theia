/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

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
        super.init();
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
