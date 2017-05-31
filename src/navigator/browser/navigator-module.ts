/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { MenuContribution } from '../../application/common';
import { FrontendApplicationContribution } from "../../application/browser";
import { FileNavigatorWidget, ID } from "./navigator-widget";
import { NavigatorMenuContribution } from './navigator-menu';
import { FileNavigatorContribution } from "./navigator-contribution";
import { createFileNavigatorContainer } from "./navigator-container";

export const navigatorModule = new ContainerModule(bind => {
    bind(FrontendApplicationContribution).to(FileNavigatorContribution).inSingletonScope();
    bind(MenuContribution).to(NavigatorMenuContribution).inSingletonScope();
    bind(FileNavigatorWidget).toDynamicValue(ctx =>
        createFileNavigatorContainer(ctx.container).get(FileNavigatorWidget)
    ).inSingletonScope().whenTargetNamed(ID);
});
