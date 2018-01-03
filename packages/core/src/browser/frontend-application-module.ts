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
    MessageService,
    MessageClient
} from "../common";
import { FrontendApplication, FrontendApplicationContribution } from './frontend-application';
import { DefaultOpenerService, OpenerService, OpenHandler } from './opener-service';
import { CommonFrontendContribution } from './common-frontend-contribution';
import { QuickOpenService, QuickCommandService, QuickCommandFrontendContribution } from './quick-open';
import { LocalStorageService, StorageService } from './storage-service';
import { WidgetFactory, WidgetManager } from './widget-manager';
import {
    ApplicationShell, ApplicationShellOptions, DockPanelRenderer, TabBarRenderer,
    TabBarRendererFactory, ShellLayoutRestorer, SidePanelHandler, SidePanelHandlerFactory
} from './shell';
import { StatusBar, StatusBarImpl } from "./status-bar/status-bar";
import { LabelParser } from './label-parser';
import { LabelProvider, LabelProviderContribution, DefaultUriLabelProviderContribution } from "./label-provider";

import '../../src/browser/style/index.css';
import 'font-awesome/css/font-awesome.min.css';
import { ThemingCommandContribution, ThemeService } from './theming';

export const frontendApplicationModule = new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(FrontendApplication).toSelf().inSingletonScope();
    bindContributionProvider(bind, FrontendApplicationContribution);

    bind(ApplicationShellOptions).toConstantValue({});
    bind(ApplicationShell).toSelf().inSingletonScope();
    bind(SidePanelHandlerFactory).toAutoFactory(SidePanelHandler);
    bind(SidePanelHandler).toSelf();

    bind(DockPanelRenderer).toSelf();
    bind(TabBarRendererFactory).toAutoFactory(TabBarRenderer);
    bind(TabBarRenderer).toSelf();

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

    bind(MessageClient).toSelf().inSingletonScope();
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

    bindContributionProvider(bind, LabelProviderContribution);
    bind(LabelProvider).toSelf().inSingletonScope();
    bind(LabelProviderContribution).to(DefaultUriLabelProviderContribution).inSingletonScope();

    bind(CommandContribution).to(ThemingCommandContribution).inSingletonScope();
});

const theme = ThemeService.get().getCurrentTheme().id;
ThemeService.get().setCurrentTheme(theme);
