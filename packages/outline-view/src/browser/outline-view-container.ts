/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { interfaces, Container } from 'inversify';
import { createTreeContainer, TreeWidget, Tree, ITree } from "@theia/core/lib/browser";
import { OutlineViewWidget } from './outline-view-widget';
import { OutlineViewTree } from './outline-view-tree';

export function createOutlineViewTreeContainer(parent: interfaces.Container): Container {
    const child = createTreeContainer(parent);

    child.unbind(Tree);
    child.bind(OutlineViewTree).toSelf();
    child.rebind(ITree).toDynamicValue(ctx => ctx.container.get(OutlineViewTree));

    child.unbind(TreeWidget);
    child.bind(OutlineViewWidget).toSelf();

    return child;
}

export function createOutlineViewWidget(parent: interfaces.Container): OutlineViewWidget {
    return createOutlineViewTreeContainer(parent).get(OutlineViewWidget);
}
