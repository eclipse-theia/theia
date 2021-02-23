/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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
import { createTreeContainer, Tree, TreeImpl, TreeModel, TreeModelImpl, TreeWidget } from '@theia/core/lib/browser';
import { CallHierarchyTree } from './callhierarchy-tree';
import { CallHierarchyTreeModel } from './callhierarchy-tree-model';
import { CallHierarchyTreeWidget } from './callhierarchy-tree-widget';

function createHierarchyTreeContainer(parent: interfaces.Container): Container {
    const child = createTreeContainer(parent);

    child.unbind(TreeImpl);
    child.bind(CallHierarchyTree).toSelf();
    child.rebind(Tree).toService(CallHierarchyTree);

    child.unbind(TreeModelImpl);
    child.bind(CallHierarchyTreeModel).toSelf();
    child.rebind(TreeModel).toService(CallHierarchyTreeModel);

    child.bind(CallHierarchyTreeWidget).toSelf();
    child.rebind(TreeWidget).toService(CallHierarchyTreeWidget);

    return child;
}

export function createHierarchyTreeWidget(parent: interfaces.Container): CallHierarchyTreeWidget {
    return createHierarchyTreeContainer(parent).get<CallHierarchyTreeWidget>(CallHierarchyTreeWidget);
}
