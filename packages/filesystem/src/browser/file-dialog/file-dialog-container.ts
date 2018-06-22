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

import { interfaces, Container } from "inversify";
import { TreeModel } from "@theia/core/lib/browser";
import { createFileTreeContainer, FileTreeModel, FileTreeWidget } from '../file-tree';
import { FileDialog, FileDialogProps } from "./file-dialog";
import { FileDialogModel } from "./file-dialog-model";
import { FileDialogWidget } from './file-dialog-widget';

export function createFileDialogContainer(parent: interfaces.Container): Container {
    const child = createFileTreeContainer(parent);

    child.unbind(FileTreeModel);
    child.bind(FileDialogModel).toSelf();
    child.rebind(TreeModel).toDynamicValue(ctx => ctx.container.get(FileDialogModel));

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
