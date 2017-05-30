/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, interfaces, Container } from 'inversify';
import { MenuContribution } from '../../application/common';
import { FrontendApplicationContribution } from "../../application/browser";
import {
    ITreeModel, ITree,
    ITreeSelectionService, TreeSelectionService,
    ITreeExpansionService, TreeExpansionService,
    TreeProps, defaultTreeProps
} from "./tree";
import { FileNavigatorTree } from "./navigator-tree";
import { FileNavigatorModel } from "./navigator-model";
import { FileNavigatorWidget } from "./navigator-widget";
import { NavigatorMenuContribution } from './navigator-command';
import { FileNavigatorContribution, TREE_PROPS, ID } from "./navigator-contribution";

export function createNavigatorContainer(parent: interfaces.Container): Container {
    const child = new Container({ defaultScope: 'Singleton' });
    child.parent = parent;
    child.bind(FileNavigatorWidget).toSelf();
    child.bind(TreeProps).toConstantValue(defaultTreeProps);
    child.bind(FileNavigatorModel).toSelf();
    child.bind(ITreeModel).toDynamicValue(ctx => ctx.container.get(FileNavigatorModel));
    child.bind(FileNavigatorTree).toSelf();
    child.bind(ITree).toDynamicValue(ctx => ctx.container.get(FileNavigatorTree));
    child.bind(ITreeSelectionService).to(TreeSelectionService);
    child.bind(ITreeExpansionService).to(TreeExpansionService);
    return child;
}

export function createFilesContainer(parent: interfaces.Container): Container {
    const child = new Container({ defaultScope: 'Singleton' });
    child.parent = createNavigatorContainer(parent);
    child.bind(TreeProps).toConstantValue(TREE_PROPS);
    return child;
}

export const navigatorModule = new ContainerModule(bind => {
    bind(FrontendApplicationContribution).to(FileNavigatorContribution).inSingletonScope();
    bind(MenuContribution).to(NavigatorMenuContribution).inSingletonScope();
    bind(FileNavigatorWidget).toDynamicValue(ctx =>
        createFilesContainer(ctx.container).get(FileNavigatorWidget)
    ).inSingletonScope().whenTargetNamed(ID);
});
