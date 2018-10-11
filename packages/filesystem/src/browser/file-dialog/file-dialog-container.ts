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

import { interfaces, Container } from 'inversify';
import { Tree, TreeModel, TreeProps, defaultTreeProps } from '@theia/core/lib/browser';
import { createFileTreeContainer, FileTreeModel, FileTreeWidget } from '../file-tree';
import { OpenFileDialog, OpenFileDialogProps, SaveFileDialog, SaveFileDialogProps } from './file-dialog';
import { FileDialogModel } from './file-dialog-model';
import { FileDialogWidget } from './file-dialog-widget';
import { FileDialogTree } from './file-dialog-tree';

export function createFileDialogContainer(parent: interfaces.Container): Container {
    const child = createFileTreeContainer(parent);

    child.unbind(FileTreeModel);
    child.bind(FileDialogModel).toSelf();
    child.rebind(TreeModel).toService(FileDialogModel);

    child.unbind(FileTreeWidget);
    child.bind(FileDialogWidget).toSelf();

    child.bind(FileDialogTree).toSelf();
    child.rebind(Tree).toService(FileDialogTree);

    return child;
}

export function createOpenFileDialogContainer(parent: interfaces.Container, props: OpenFileDialogProps): Container {
    const container = createFileDialogContainer(parent);
    container.rebind(TreeProps).toConstantValue({
        ...defaultTreeProps,
        multiSelect: props.canSelectMany,
        search: true
    });

    container.bind(OpenFileDialogProps).toConstantValue(props);
    container.bind(OpenFileDialog).toSelf();

    return container;
}

export function createSaveFileDialogContainer(parent: interfaces.Container, props: SaveFileDialogProps): Container {
    const container = createFileDialogContainer(parent);
    container.rebind(TreeProps).toConstantValue({
        ...defaultTreeProps,
        multiSelect: false,
        search: true
    });

    container.bind(SaveFileDialogProps).toConstantValue(props);
    container.bind(SaveFileDialog).toSelf();

    return container;
}
