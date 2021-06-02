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

import { injectable, inject } from '@theia/core/shared/inversify';
import { ContextMenuRenderer, NodeProps, TreeProps, TreeNode, SELECTED_CLASS, FOCUS_CLASS } from '@theia/core/lib/browser';
import { FileTreeWidget, FileStatNode } from '../file-tree';
import { FileDialogModel } from './file-dialog-model';

export const FILE_DIALOG_CLASS = 'theia-FileDialog';
export const NOT_SELECTABLE_CLASS = 'theia-mod-not-selectable';

@injectable()
export class FileDialogWidget extends FileTreeWidget {

    private _disableFileSelection: boolean = false;

    constructor(
        @inject(TreeProps) readonly props: TreeProps,
        @inject(FileDialogModel) readonly model: FileDialogModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer
    ) {
        super(props, model, contextMenuRenderer);
        this.addClass(FILE_DIALOG_CLASS);
    }

    set disableFileSelection(isSelectable: boolean) {
        this._disableFileSelection = isSelectable;
        this.model.disableFileSelection = isSelectable;
    }

    protected createNodeAttributes(node: TreeNode, props: NodeProps): React.Attributes & React.HTMLAttributes<HTMLElement> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const attr = super.createNodeAttributes(node, props) as any;
        if (this.shouldDisableSelection(node)) {
            const keys = Object.keys(attr);
            keys.forEach(k => {
                if (['className', 'style', 'title'].indexOf(k) < 0) {
                    delete attr[k];
                }
            });
        }
        return attr;
    }

    protected createNodeClassNames(node: TreeNode, props: NodeProps): string[] {
        const classNames = super.createNodeClassNames(node, props);
        if (this.shouldDisableSelection(node)) {
            [SELECTED_CLASS, FOCUS_CLASS].forEach(name => {
                const ind = classNames.indexOf(name);
                if (ind >= 0) {
                    classNames.splice(ind, 1);
                }
            });
            classNames.push(NOT_SELECTABLE_CLASS);
        }
        return classNames;
    }

    protected shouldDisableSelection(node: TreeNode): boolean {
        return FileStatNode.is(node) && !node.fileStat.isDirectory && this._disableFileSelection;
    }
}
