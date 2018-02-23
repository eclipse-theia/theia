/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces, Container } from 'inversify';
import { createTreeContainer, ITree, Tree, ITreeModel, TreeModel, TreeWidget } from "@theia/core/lib/browser";
import { CallHierarchyTree } from "./callhierarchy-tree";
import { CallHierarchyTreeModel } from './callhierarchy-tree-model';
import { CallHierarchyTreeWidget } from "./callhierarchy-tree-widget";

function createHierarchyTreeContainer(parent: interfaces.Container): Container {
    const child = createTreeContainer(parent);

    child.unbind(Tree);
    child.bind(CallHierarchyTree).toSelf();
    child.rebind(ITree).toDynamicValue(ctx => ctx.container.get(CallHierarchyTree));

    child.unbind(TreeModel);
    child.bind(CallHierarchyTreeModel).toSelf();
    child.rebind(ITreeModel).toDynamicValue(ctx => ctx.container.get(CallHierarchyTreeModel));

    child.bind(CallHierarchyTreeWidget).toSelf();
    child.rebind(TreeWidget).toDynamicValue(ctx => ctx.container.get(CallHierarchyTreeWidget));

    return child;
}

export function createHierarchyTreeWidget(parent: interfaces.Container): CallHierarchyTreeWidget {
    return createHierarchyTreeContainer(parent).get<CallHierarchyTreeWidget>(CallHierarchyTreeWidget);
}
