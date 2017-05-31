/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Widget } from "@phosphor/widgets/lib";
import { AbstractDialog, DialogTitle } from "../../../application/browser";
import { UriSelection } from '../../../filesystem/common';
import { FileTreeWidget } from "../../../navigator/browser/file-tree";

export const FileDialogFactory = Symbol('FileDialogFactory');
export interface FileDialogFactory {
    (title: string): FileDialog;
}

@injectable()
export class FileDialog extends AbstractDialog<UriSelection | undefined> {

    constructor(
        @inject(DialogTitle) title: string,
        @inject(FileTreeWidget) readonly fileTreeWidget: FileTreeWidget
    ) {
        super(title);
    }

    protected attach(): void {
        super.attach();
        Widget.attach(this.fileTreeWidget, this.contentNode);
    }

    protected detach(): void {
        Widget.detach(this.fileTreeWidget);
        super.detach();
    }

    get value(): UriSelection | undefined {
        return this.fileTreeWidget.model.selectedFileStatNode;
    }

}