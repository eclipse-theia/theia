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
import { BulkEditTreeWidget } from './bulk-edit-tree-widget';
import { BulkEditTree } from './bulk-edit-tree';
import { BulkEditTreeModel } from './bulk-edit-tree-model';
import { TreeWidget, TreeProps, defaultTreeProps, TreeModel, createTreeContainer, TreeModelImpl, TreeImpl, Tree } from '@theia/core/lib/browser';

export function createBulkEditContainer(parent: interfaces.Container): Container {
    const child = createTreeContainer(parent);

    child.unbind(TreeImpl);
    child.bind(BulkEditTree).toSelf();
    child.rebind(Tree).toService(BulkEditTree);

    child.unbind(TreeWidget);
    child.bind(BulkEditTreeWidget).toSelf();

    child.unbind(TreeModelImpl);
    child.bind(BulkEditTreeModel).toSelf();
    child.rebind(TreeModel).toService(BulkEditTreeModel);
    child.rebind(TreeProps).toConstantValue(defaultTreeProps);

    return child;
}

export function createBulkEditTreeWidget(parent: interfaces.Container): BulkEditTreeWidget {
    return createBulkEditContainer(parent).get(BulkEditTreeWidget);
}
