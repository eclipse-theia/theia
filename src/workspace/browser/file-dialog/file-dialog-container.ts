/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces, Container } from "inversify";
import { DialogTitle } from '../../../application/browser/dialogs';
import { createFileTreeContainer } from '../../../navigator/browser/file-tree';
import { FileDialog } from "./file-dialog";

export function createFileDialogContainer(parent: interfaces.Container): Container {
    const child = createFileTreeContainer(parent);

    child.bind(FileDialog).toSelf();

    return child;
}

export function createFileDialog(parent: interfaces.Container, title: string): FileDialog {
    const container = createFileDialogContainer(parent);
    container.bind(DialogTitle).toConstantValue(title);
    return container.get(FileDialog);
}