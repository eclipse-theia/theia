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

import { injectable, inject } from "inversify";
import { ContextMenuRenderer, TreeProps } from "@theia/core/lib/browser";
import { FileTreeWidget } from "../file-tree";
import { FileDialogModel } from "./file-dialog-model";

export const FILE_DIALOG_CLASS = 'theia-FileDialog';

@injectable()
export class FileDialogWidget extends FileTreeWidget {

    constructor(
        @inject(TreeProps) readonly props: TreeProps,
        @inject(FileDialogModel) readonly model: FileDialogModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer
    ) {
        super(props, model, contextMenuRenderer);
        this.addClass(FILE_DIALOG_CLASS);
    }

}
