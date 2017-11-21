/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { ContextMenuRenderer, TreeProps } from "@theia/core/lib/browser";
import { FileTreeWidget } from "../file-tree";
import { FileDialogModel } from "./file-dialog-model";
import { FileIconProvider } from '../icons/file-icons';

export const FILE_DIALOG_CLASS = 'theia-FileDialog';

@injectable()
export class FileDialogWidget extends FileTreeWidget {

    constructor(
        @inject(TreeProps) readonly props: TreeProps,
        @inject(FileDialogModel) readonly model: FileDialogModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer,
        @inject(FileIconProvider) readonly iconProvider: FileIconProvider
    ) {
        super(props, model, contextMenuRenderer, iconProvider);
        this.addClass(FILE_DIALOG_CLASS);
    }

}
