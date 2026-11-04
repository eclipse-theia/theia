// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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
import { createTreeContainer, } from '@theia/core/lib/browser/tree';
import { TypeHierarchyTree } from './typehierarchy-tree.js';
import { TypeHierarchyTreeModel } from './typehierarchy-tree-model.js';
import { TypeHierarchyTreeWidget } from './typehierarchy-tree-widget.js';

function createHierarchyTreeContainer(parent: interfaces.Container): Container {
    const child = createTreeContainer(parent, {
        tree: TypeHierarchyTree,
        model: TypeHierarchyTreeModel,
        widget: TypeHierarchyTreeWidget
    });

    return child;
}

export function createHierarchyTreeWidget(parent: interfaces.Container): TypeHierarchyTreeWidget {
    return createHierarchyTreeContainer(parent).get(TypeHierarchyTreeWidget);
}
