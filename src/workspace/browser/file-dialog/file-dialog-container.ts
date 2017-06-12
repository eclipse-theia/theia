/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces, Container } from "inversify";
import { ITreeModel } from "../../../application/browser";
import { createFileTreeContainer, FileTreeModel, FileTreeWidget } from '../../../filesystem/browser';
import { FileDialog, FileDialogProps } from "./file-dialog";
import { FileDialogModel } from "./file-dialog-model";
import { FileDialogWidget } from './file-dialog-widget';

export function createFileDialogContainer(parent: interfaces.Container): Container {
    const child = createFileTreeContainer(parent);

    child.unbind(FileTreeModel);
    child.bind(FileDialogModel).toSelf();
    child.rebind(ITreeModel).toDynamicValue(ctx => ctx.container.get(FileDialogModel));

    child.unbind(FileTreeWidget);
    child.bind(FileDialogWidget).toSelf();

    child.bind(FileDialog).toSelf();

    return child;
}

export function createFileDialog(parent: interfaces.Container, props: FileDialogProps): FileDialog {
    const container = createFileDialogContainer(parent);
    container.bind(FileDialogProps).toConstantValue(props);
    return container.get(FileDialog);
}