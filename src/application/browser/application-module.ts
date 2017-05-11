
/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { ContainerModule } from "inversify"

import {
    bindExtensionProvider,
    SelectionService,
    ResourceProvider, ResourceResolver, DefaultResourceProvider,
    CommonCommandContribution, CommonMenuContribution,
    CommandContribution, CommandRegistry,
    MenuModelRegistry, MenuContribution,
    KeybindingContextRegistry, KeybindingRegistry,
    KeybindingContext,
    KeybindingContribution
} from "../common"
import { TheiaApplication, TheiaPlugin } from './application'
import { DefaultOpenerService, OpenerService, OpenHandler } from './opener-service';

export const browserApplicationModule = new ContainerModule(bind => {
    bind(TheiaApplication).toSelf().inSingletonScope()
    bindExtensionProvider(bind, TheiaPlugin)

    bindExtensionProvider(bind, OpenHandler)
    bind(DefaultOpenerService).toSelf().inSingletonScope();
    bind(OpenerService).toDynamicValue(context => context.container.get(DefaultOpenerService));

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
