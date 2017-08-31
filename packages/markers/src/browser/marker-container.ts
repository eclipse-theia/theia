/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { interfaces, Container } from "inversify";
import { MarkerTreeServices } from './marker-tree-model';
import { MarkerTree } from './marker-tree';
import { createTreeContainer, TreeServices, Tree, ITree } from "@theia/core/lib/browser";

export function createMarkerTreeContainer(parent: interfaces.Container): Container {
    const child = createTreeContainer(parent);

    child.unbind(Tree);
    child.bind(MarkerTree).toSelf();
    child.rebind(ITree).toDynamicValue(ctx => ctx.container.get(MarkerTree));

    child.unbind(TreeServices);
    child.bind(MarkerTreeServices).toSelf();

    return child;
}
