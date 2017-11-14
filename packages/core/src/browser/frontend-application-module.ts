/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";
import {
    bindContributionProvider,
    SelectionService,
    ResourceProvider, ResourceResolver, DefaultResourceProvider,
    CommandContribution, CommandRegistry, CommandService,
    MenuModelRegistry, MenuContribution,
    KeybindingContextRegistry, KeybindingRegistry,
    KeybindingContext,
    KeybindingContribution,
    MessageService
} from "../common";
import { MessageClient, messageServicePath } from '../common/message-service-protocol';
import { FrontendApplication, FrontendApplicationContribution } from './frontend-application';
import { DefaultOpenerService, OpenerService, OpenHandler } from './opener-service';
import { HumaneMessageClient } from './humane-message-client';
import { WebSocketConnectionProvider } from './messaging';
import { CommonFrontendContribution } from './common-frontend-contribution';
import { QuickOpenService, QuickCommandService, QuickCommandFrontendContribution } from './quick-open';
import { LocalStorageService, StorageService } from './storage-service';
import { WidgetFactory, WidgetManager } from './widget-manager';
import { ShellLayoutRestorer } from './shell-layout-restorer';
import { ApplicationShell, ApplicationShellOptions, DockPanelRenderer, DockPanelTabBarRenderer, DockPanelTabBarRendererFactory } from './shell';
import { StatusBar, StatusBarImpl } from "./statusbar/statusbar";
import { LabelParser } from './label-parser';

import '../../src/browser/style/index.css';
import 'font-awesome/css/font-awesome.min.css';

export const frontendApplicationModule = new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(FrontendApplication).toSelf().inSingletonScope();
    bindContributionProvider(bind, FrontendApplicationContribution);

    bind(ApplicationShellOptions).toConstantValue({});
    bind(ApplicationShell).toSelf().inSingletonScope();

    bind(DockPanelRenderer).toSelf();
    bind(DockPanelTabBarRendererFactory).toAutoFactory(DockPanelTabBarRenderer);
    bind(DockPanelTabBarRenderer).toSelf();

    bindContributionProvider(bind, OpenHandler);
    bind(DefaultOpenerService).toSelf().inSingletonScope();
    bind(OpenerService).toDynamicValue(context => context.container.get(DefaultOpenerService));

    bindContributionProvider(bind, WidgetFactory);
    bind(WidgetManager).toSelf().inSingletonScope();
    bind(ShellLayoutRestorer).toSelf().inSingletonScope();
    bind(CommandContribution).toDynamicValue(ctx => ctx.container.get(ShellLayoutRestorer));

    bind(DefaultResourceProvider).toSelf().inSingletonScope();
    bind(ResourceProvider).toProvider(context =>
        uri => context.container.get(DefaultResourceProvider).get(uri)
    );
    bindContributionProvider(bind, ResourceResolver);

    bind(SelectionService).toSelf().inSingletonScope();
    bind(CommandRegistry).toSelf().inSingletonScope();
    bind(CommandService).toDynamicValue(context => context.container.get(CommandRegistry));
    bindContributionProvider(bind, CommandContribution);

    bind(MenuModelRegistry).toSelf().inSingletonScope();
    bindContributionProvider(bind, MenuContribution);

    bind(KeybindingRegistry).toSelf().inSingletonScope();
    bindContributionProvider(bind, KeybindingContribution);

    bind(KeybindingContextRegistry).toSelf().inSingletonScope();
    bindContributionProvider(bind, KeybindingContext);

    bind(HumaneMessageClient).toSelf().inSingletonScope();
    bind(MessageClient).toDynamicValue(ctx => {
        const messageService = ctx.container.get(HumaneMessageClient);
        WebSocketConnectionProvider.createProxy(ctx.container, messageServicePath, messageService);
        return messageService;
    }).inSingletonScope();
    bind(MessageService).toSelf().inSingletonScope();

    bind(CommonFrontendContribution).toSelf().inSingletonScope();
    [CommandContribution, KeybindingContribution, MenuContribution].forEach(serviceIdentifier =>
        bind(serviceIdentifier).toDynamicValue(ctx => ctx.container.get(CommonFrontendContribution)).inSingletonScope()
    );

    bind(QuickOpenService).toSelf().inSingletonScope();
    bind(QuickCommandService).toSelf().inSingletonScope();
    bind(QuickCommandFrontendContribution).toSelf().inSingletonScope();
    [CommandContribution, KeybindingContribution].forEach(serviceIdentifier =>
        bind(serviceIdentifier).toDynamicValue(ctx => ctx.container.get(QuickCommandFrontendContribution)).inSingletonScope()
    );

    bind(StorageService).to(LocalStorageService).inSingletonScope();

    bind(StatusBarImpl).toSelf().inSingletonScope();
    bind(StatusBar).toDynamicValue(ctx => ctx.container.get(StatusBarImpl)).inSingletonScope();
    bind(LabelParser).toSelf().inSingletonScope();
});
