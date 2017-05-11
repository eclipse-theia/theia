
/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { ContainerModule } from "inversify"

import { SelectionService } from '../common/selection-service'
import { CommonCommandContribution, CommonMenuContribution } from '../common/commands-common'
import { bindExtensionProvider } from '../common/extension-provider';
import { TheiaApplication, TheiaPlugin } from './application'
import { OpenerService, OpenHandler } from "./opener-service"
import { ResourceProvider, ResourceResolver, DefaultResourceProvider } from "../common";
import { CommandContribution, CommandRegistry } from "../common/command"
import { MenuModelRegistry, MenuContribution } from "../common/menu"
import {
    KeybindingContextRegistry, KeybindingRegistry,
    KeybindingContext,
    KeybindingContribution
} from "../common/keybinding"

export const browserApplicationModule = new ContainerModule(bind => {
    bind(TheiaApplication).toSelf().inSingletonScope()
    bindExtensionProvider(bind, TheiaPlugin)

    bind(OpenerService).toSelf().inSingletonScope()
    bindExtensionProvider(bind, OpenHandler)

    bind(DefaultResourceProvider).toSelf().inSingletonScope();
    bind(ResourceProvider).toProvider(context =>
        uri => context.container.get(DefaultResourceProvider).get(uri)
    );
    bindExtensionProvider(bind, ResourceResolver)

    bind(SelectionService).toSelf().inSingletonScope();
    bind(CommandRegistry).toSelf().inSingletonScope()
    bind(CommandContribution).to(CommonCommandContribution)
    bindExtensionProvider(bind, CommandContribution)

    bind(MenuContribution).to(CommonMenuContribution)
    bind(MenuModelRegistry).toSelf().inSingletonScope();
    bindExtensionProvider(bind, MenuContribution)

    bind(KeybindingRegistry).toSelf().inSingletonScope()
    bindExtensionProvider(bind, KeybindingContribution)

    bind(KeybindingContextRegistry).toSelf().inSingletonScope()
    bindExtensionProvider(bind, KeybindingContext)
});
