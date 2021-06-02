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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { Emitter, Event } from '@theia/core/lib/common';
import { TreeNode, SelectableTreeNode } from '@theia/core/lib/browser';
import { DirNode, FileNode, FileTreeModel, FileStatNode } from '../file-tree';
import { FileDialogTree } from './file-dialog-tree';

@injectable()
export class FileDialogModel extends FileTreeModel {

    @inject(FileDialogTree) readonly tree: FileDialogTree;
    protected readonly onDidOpenFileEmitter = new Emitter<void>();
    protected _initialLocation: URI | undefined;
    private _disableFileSelection: boolean = false;

    @postConstruct()
    protected init(): void {
        super.init();
        this.toDispose.push(this.onDidOpenFileEmitter);
    }

    /**
     * Returns the first valid location that was set by calling the `navigateTo` method. Once the initial location has a defined value, it will not change.
     * Can be `undefined`.
     */
    get initialLocation(): URI | undefined {
        return this._initialLocation;
    }

    set disableFileSelection(isSelectable: boolean) {
        this._disableFileSelection = isSelectable;
    }

    async navigateTo(nodeOrId: TreeNode | string | undefined): Promise<TreeNode | undefined> {
        const result = await super.navigateTo(nodeOrId);
        if (!this._initialLocation && FileStatNode.is(result)) {
            this._initialLocation = result.uri;
        }
        return result;
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

    getNextSelectableNode(node: SelectableTreeNode = this.selectedNodes[0]): SelectableTreeNode | undefined {
        let nextNode: SelectableTreeNode | undefined = node;
        do {
            nextNode = super.getNextSelectableNode(nextNode);
        } while (FileStatNode.is(nextNode) && !this.isFileStatNodeSelectable(nextNode));
        return nextNode;
    }

    getPrevSelectableNode(node: SelectableTreeNode = this.selectedNodes[0]): SelectableTreeNode | undefined {
        let prevNode: SelectableTreeNode | undefined = node;
        do {
            prevNode = super.getPrevSelectableNode(prevNode);
        } while (FileStatNode.is(prevNode) && !this.isFileStatNodeSelectable(prevNode));
        return prevNode;
    }

    private isFileStatNodeSelectable(node: FileStatNode): boolean {
        return !(!node.fileStat.isDirectory && this._disableFileSelection);
    }

    canNavigateUpward(): boolean {
        const treeRoot = this.tree.root;
        return FileStatNode.is(treeRoot) && !treeRoot.uri.path.isRoot;
    }
}
