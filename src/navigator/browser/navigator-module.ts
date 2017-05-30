/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { MenuContribution } from '../../application/common';
import { FrontendApplicationContribution } from "../../application/browser";
import {
    ITreeModel, ITree,
    ITreeSelectionService, TreeSelectionService,
    ITreeExpansionService, TreeExpansionService,
    TreeProps
} from "./tree";
import { FileNavigatorTree } from "./navigator-tree";
import { FileNavigatorModel } from "./navigator-model";
import { FileNavigatorWidget } from "./navigator-widget";
import { NavigatorMenuContribution } from './navigator-command';
import { FileNavigatorContribution, TREE_PROPS } from "./navigator-contribution";

export const navigatorModule = new ContainerModule(bind => {
    bind(TreeProps).toConstantValue(TREE_PROPS);
    bind(FileNavigatorWidget).toSelf().inSingletonScope();

    bind(FileNavigatorModel).toSelf().inSingletonScope();
    bind(ITreeModel).toDynamicValue(ctx => ctx.container.get(FileNavigatorModel)).inSingletonScope();

    bind(FileNavigatorTree).toSelf().inSingletonScope();
    bind(ITree).toDynamicValue(ctx => ctx.container.get(FileNavigatorTree)).inSingletonScope();

    bind(ITreeSelectionService).to(TreeSelectionService).inSingletonScope();
    bind(ITreeExpansionService).to(TreeExpansionService).inSingletonScope();

    bind(FrontendApplicationContribution).to(FileNavigatorContribution).inSingletonScope();
    bind(MenuContribution).to(NavigatorMenuContribution).inSingletonScope();
});
