/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { FrontendApplicationContribution } from '../../browser/application';
import { MainMenuFactory, MenuContribution } from './menu-plugin';
import { ContainerModule } from 'inversify';
import { ElectronContextMenuRenderer } from "./context-menu-renderer";
import { ContextMenuRenderer } from "../../browser/menu/context-menu-renderer";

export const electronMenuModule = new ContainerModule(bind => {
    bind(FrontendApplicationContribution).to(MenuContribution);
    bind(ContextMenuRenderer).to(ElectronContextMenuRenderer);
    bind(MainMenuFactory).toSelf().inSingletonScope();
});
