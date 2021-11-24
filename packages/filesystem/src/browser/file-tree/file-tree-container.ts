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

import { interfaces, Container } from '@theia/core/shared/inversify';
import { Tree, TreeModel } from '@theia/core/lib/browser';
import { FileTree } from './file-tree';
import { FileTreeModel } from './file-tree-model';
import { FileTreeWidget } from './file-tree-widget';
import { CompressibleTree, CompressibleTreeModel, CompressibleTreeWidget, createCompressibleTreeContainer } from '../compressible-tree';

export function createFileTreeContainer(parent: interfaces.Container): Container {
    const child = createCompressibleTreeContainer(parent);

    child.unbind(CompressibleTree);
    child.bind(FileTree).toSelf();
    child.rebind(Tree).toService(FileTree);

    child.unbind(CompressibleTreeModel);
    child.bind(FileTreeModel).toSelf();
    child.rebind(TreeModel).toService(FileTreeModel);

    child.unbind(CompressibleTreeWidget);
    child.bind(FileTreeWidget).toSelf();

    return child;
}
