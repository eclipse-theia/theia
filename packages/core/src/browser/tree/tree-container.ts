/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces, Container } from 'inversify';
import { TreeWidget, TreeProps, defaultTreeProps } from "./tree-widget";
import { TreeModelImpl, TreeModel } from "./tree-model";
import { TreeImpl, Tree } from "./tree";
import { TreeSelectionService } from "./tree-selection";
import { TreeSelectionServiceImpl } from './tree-selection-impl';
import { TreeExpansionService, TreeExpansionServiceImpl } from "./tree-expansion";
import { TreeNavigationService } from './tree-navigation';
import { TreeDecoratorService, NoopTreeDecoratorService } from './tree-decorator';

export function createTreeContainer(parent: interfaces.Container): Container {
    const child = new Container({ defaultScope: 'Singleton' });
    child.parent = parent;

    child.bind(TreeImpl).toSelf();
    child.bind(Tree).toDynamicValue(ctx => ctx.container.get(TreeImpl));

    child.bind(TreeSelectionServiceImpl).toSelf();
    child.bind(TreeSelectionService).toDynamicValue(ctx => ctx.container.get(TreeSelectionServiceImpl));

    child.bind(TreeExpansionServiceImpl).toSelf();
    child.bind(TreeExpansionService).toDynamicValue(ctx => ctx.container.get(TreeExpansionServiceImpl));

    child.bind(TreeNavigationService).toSelf();

    child.bind(TreeModelImpl).toSelf();
    child.bind(TreeModel).toDynamicValue(ctx => ctx.container.get(TreeModelImpl));

    child.bind(TreeWidget).toSelf();
    child.bind(TreeProps).toConstantValue(defaultTreeProps);

    child.bind(TreeDecoratorService).to(NoopTreeDecoratorService).inSingletonScope();
    return child;
}
