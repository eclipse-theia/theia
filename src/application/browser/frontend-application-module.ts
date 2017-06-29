/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify"
import {
    bindContributionProvider,
    SelectionService,
    ResourceProvider, ResourceResolver, DefaultResourceProvider,
    CommonCommandContribution, CommonMenuContribution,
    CommandContribution, CommandRegistry, CommandService,
    MenuModelRegistry, MenuContribution,
    KeybindingContextRegistry, KeybindingRegistry,
    KeybindingContext,
    KeybindingContribution
} from "../common"
import { FrontendApplication, FrontendApplicationContribution } from './frontend-application'
import { DefaultOpenerService, OpenerService, OpenHandler } from './opener-service';

import 'theia-core/src/application/browser/style/index.css';
import 'font-awesome/css/font-awesome.min.css';

export const frontendApplicationModule = new ContainerModule(bind => {
    bind(FrontendApplication).toSelf().inSingletonScope()
    bindContributionProvider(bind, FrontendApplicationContribution)

    bindContributionProvider(bind, OpenHandler)
    bind(DefaultOpenerService).toSelf().inSingletonScope();
    bind(OpenerService).toDynamicValue(context => context.container.get(DefaultOpenerService));

    bind(DefaultResourceProvider).toSelf().inSingletonScope();
    bind(ResourceProvider).toProvider(context =>
        uri => context.container.get(DefaultResourceProvider).get(uri)
    );
    bindContributionProvider(bind, ResourceResolver)

    bind(SelectionService).toSelf().inSingletonScope();
    bind(CommandRegistry).toSelf().inSingletonScope();
    bind(CommandService).toDynamicValue(context => context.container.get(CommandRegistry));
    bind(CommandContribution).to(CommonCommandContribution).inSingletonScope();
    bindContributionProvider(bind, CommandContribution);

    bind(MenuContribution).to(CommonMenuContribution)
    bind(MenuModelRegistry).toSelf().inSingletonScope();
    bindContributionProvider(bind, MenuContribution)

    bind(KeybindingRegistry).toSelf().inSingletonScope()
    bindContributionProvider(bind, KeybindingContribution)

    bind(KeybindingContextRegistry).toSelf().inSingletonScope()
    bindContributionProvider(bind, KeybindingContext)
});
