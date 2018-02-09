/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { CommandContribution, MenuContribution } from "../../common";
import { FrontendApplicationContribution, ContextMenuRenderer, KeybindingContribution, KeybindingContext } from '../../browser';
import { ElectronMainMenuFactory } from './electron-main-menu-factory';
import { ElectronContextMenuRenderer } from "./electron-context-menu-renderer";
import { ElectronMenuContribution } from "./electron-menu-contribution";

export default new ContainerModule(bind => {
    bind(ElectronMainMenuFactory).toSelf().inSingletonScope();
    bind(ContextMenuRenderer).to(ElectronContextMenuRenderer).inSingletonScope();
    bind(KeybindingContext).toConstantValue({
        id: "theia.context",
        isEnabled: true
    });

    bind(ElectronMenuContribution).toSelf().inSingletonScope();
    for (const serviceIdentifier of [FrontendApplicationContribution, KeybindingContribution, CommandContribution, MenuContribution]) {
        bind(serviceIdentifier).toDynamicValue(ctx => ctx.container.get(ElectronMenuContribution)).inSingletonScope();
    }
});
