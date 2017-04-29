/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';

import { TheiaPlugin } from "../../application/browser";
import { FileNavigatorContribution, FileNavigatorWidget } from "./navigator-widget";

import { MenuContribution } from '../../application/common/menu';
import { FileNavigatorModel, FileNavigatorTree } from "./navigator-model";
import { NavigatorMenuContribution } from './navigator-command';
import { ITree, ITreeSelectionService, TreeSelectionService, ITreeExpansionService, TreeExpansionService } from "./tree";

export const navigatorModule = new ContainerModule(bind => {
    bind(TheiaPlugin).to(FileNavigatorContribution);
    bind(FileNavigatorWidget).toSelf().inSingletonScope();
    bind(FileNavigatorModel).toSelf().inSingletonScope();
    bind(ITree).to(FileNavigatorTree).inSingletonScope();
    bind<MenuContribution>(MenuContribution).to(NavigatorMenuContribution);
    bind(ITreeSelectionService).to(TreeSelectionService).inSingletonScope();
    bind(ITreeExpansionService).to(TreeExpansionService).inSingletonScope();
});
