// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { interfaces, Container } from '@theia/core/shared/inversify';
import { CompressedExpansionService, CompressionToggle, createTreeContainer, TreeCompressionService, TreeContainerProps } from '@theia/core/lib/browser';
import { FileTree } from './file-tree';
import { FileTreeModel } from './file-tree-model';
import { FileTreeWidget } from './file-tree-widget';

const fileTreeDefaults: Partial<TreeContainerProps> = {
    tree: FileTree,
    model: FileTreeModel,
    widget: FileTreeWidget,
    expansionService: CompressedExpansionService,
};

export function createFileTreeContainer(parent: interfaces.Container, overrides?: Partial<TreeContainerProps>): Container {
    const child = createTreeContainer(parent, { ...fileTreeDefaults, ...overrides });
    child.bind(CompressionToggle).toConstantValue({ compress: false });
    child.bind(TreeCompressionService).toSelf().inSingletonScope();

    return child;
}
