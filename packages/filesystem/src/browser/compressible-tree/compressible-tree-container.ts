/********************************************************************************
 * Copyright (c) 2021 SAP SE or an SAP affiliate company and others.
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
import { Tree, TreeModel, TreeCompressionService, createTreeContainer, TreeImpl, TreeModelImpl, TreeWidget } from '@theia/core/lib/browser';
import { CompressibleTree } from './compressible-tree';
import { CompressibleTreeModel } from './compressible-tree-model';
import { CompressibleTreeWidget } from './compressible-tree-widget';

export function createCompressibleTreeContainer(parent: interfaces.Container): Container {
    const child = createTreeContainer(parent);

    child.unbind(TreeImpl);
    child.bind(CompressibleTree).toSelf();
    child.rebind(Tree).toService(CompressibleTree);

    child.unbind(TreeModelImpl);
    child.bind(CompressibleTreeModel).toSelf();
    child.rebind(TreeModel).toService(CompressibleTreeModel);

    child.unbind(TreeWidget);
    child.bind(CompressibleTreeWidget).toSelf();

    child.bind(TreeCompressionService).toSelf();

    return child;
}
