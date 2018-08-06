/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import '../../src/browser/style/index.css';
import 'font-awesome/css/font-awesome.min.css';
import 'file-icons-js/css/style.css';

import { ContainerModule } from 'inversify';
import {
    bindContributionProvider,
    SelectionService,
    ResourceProvider, ResourceResolver, DefaultResourceProvider,
    CommandContribution, CommandRegistry, CommandService,
    MenuModelRegistry, MenuContribution,
    MessageService,
    MessageClient
} from '../common';
import { KeybindingRegistry, KeybindingContext, KeybindingContribution } from './keybinding';
import { FrontendApplication, FrontendApplicationContribution, DefaultFrontendApplicationContribution } from './frontend-application';
import { DefaultOpenerService, OpenerService, OpenHandler } from './opener-service';
import { HttpOpenHandler } from './http-open-handler';
import { CommonFrontendContribution } from './common-frontend-contribution';
import { QuickOpenService, QuickCommandService, QuickCommandFrontendContribution, QuickPickService } from './quick-open';
import { LocalStorageService, StorageService } from './storage-service';
import { WidgetFactory, WidgetManager } from './widget-manager';
import {
    ApplicationShell, ApplicationShellOptions, DockPanelRenderer, TabBarRenderer,
    TabBarRendererFactory, ShellLayoutRestorer, SidePanelHandler, SidePanelHandlerFactory, SplitPositionHandler, DockPanelRendererFactory
} from './shell';
import { StatusBar, StatusBarImpl } from './status-bar/status-bar';
import { LabelParser } from './label-parser';
import { LabelProvider, LabelProviderContribution, DefaultUriLabelProviderContribution } from './label-provider';
import {
    PreferenceProviders, PreferenceProvider, PreferenceScope, PreferenceService,
    PreferenceServiceImpl, PreferenceSchemaProvider, PreferenceContribution
} from './preferences';
import { ContextMenuRenderer } from './context-menu-renderer';
import { ThemingCommandContribution, ThemeService, BuiltinThemeProvider } from './theming';
import { ConnectionStatusService, FrontendConnectionStatusService, ApplicationConnectionStatusContribution, PingService } from './connection-status-service';
import { DiffUriLabelProviderContribution } from './diff-uris';
import { ApplicationServer, applicationPath } from '../common/application-protocol';
import { WebSocketConnectionProvider } from './messaging';
import { AboutDialog, AboutDialogProps } from './about-dialog';
import { EnvVariablesServer, envVariablesPath } from './../common/env-variables';
import { FrontendApplicationStateService } from './frontend-application-state';

export const frontendApplicationModule = new ContainerModule((bind, unbind, isBound, rebind) => {
    const themeService = ThemeService.get();
    themeService.register(...BuiltinThemeProvider.themes);
    themeService.startupTheme();

    bind(FrontendApplication).toSelf().inSingletonScope();
    bind(FrontendApplicationStateService).toSelf().inSingletonScope();
    bind(DefaultFrontendApplicationContribution).toSelf();
    bindContributionProvider(bind, FrontendApplicationContribution);

    bind(ApplicationShellOptions).toConstantValue({});
    bind(ApplicationShell).toSelf().inSingletonScope();
    bind(SidePanelHandlerFactory).toAutoFactory(SidePanelHandler);
    bind(SidePanelHandler).toSelf();
    bind(SplitPositionHandler).toSelf().inSingletonScope();

    bind(DockPanelRendererFactory).toAutoFactory(DockPanelRenderer);
    bind(DockPanelRenderer).toSelf();
    bind(TabBarRendererFactory).toFactory(context => () => {
        const contextMenuRenderer = context.container.get<ContextMenuRenderer>(ContextMenuRenderer);
        return new TabBarRenderer(contextMenuRenderer);
    });

    bindContributionProvider(bind, OpenHandler);
    bind(DefaultOpenerService).toSelf().inSingletonScope();
    bind(OpenerService).toDynamicValue(context => context.container.get(DefaultOpenerService));
    bind(HttpOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toDynamicValue(ctx => ctx.container.get(HttpOpenHandler)).inSingletonScope();

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
    bindContributionProvider(bind, KeybindingContext);
    bindContributionProvider(bind, KeybindingContribution);

    bind(MessageClient).toSelf().inSingletonScope();
    bind(MessageService).toSelf().inSingletonScope();

    bind(CommonFrontendContribution).toSelf().inSingletonScope();
    [CommandContribution, KeybindingContribution, MenuContribution].forEach(serviceIdentifier =>
        bind(serviceIdentifier).toDynamicValue(ctx => ctx.container.get(CommonFrontendContribution)).inSingletonScope()
    );

    bind(QuickOpenService).toSelf().inSingletonScope();
    bind(QuickPickService).toSelf().inSingletonScope();
    bind(QuickCommandService).toSelf().inSingletonScope();
    bind(QuickCommandFrontendContribution).toSelf().inSingletonScope();
    [CommandContribution, KeybindingContribution].forEach(serviceIdentifier =>
        bind(serviceIdentifier).toDynamicValue(ctx => ctx.container.get(QuickCommandFrontendContribution)).inSingletonScope()
    );

    bind(LocalStorageService).toSelf().inSingletonScope();
    bind(StorageService).toService(LocalStorageService);

    bind(StatusBarImpl).toSelf().inSingletonScope();
    bind(StatusBar).toDynamicValue(ctx => ctx.container.get(StatusBarImpl)).inSingletonScope();
    bind(LabelParser).toSelf().inSingletonScope();

    bindContributionProvider(bind, LabelProviderContribution);
    bind(LabelProvider).toSelf().inSingletonScope();
    bind(LabelProviderContribution).to(DefaultUriLabelProviderContribution).inSingletonScope();
    bind(LabelProviderContribution).to(DiffUriLabelProviderContribution).inSingletonScope();

    bind(PreferenceProvider).toSelf().inSingletonScope().whenTargetNamed(PreferenceScope.User);
    bind(PreferenceProvider).toSelf().inSingletonScope().whenTargetNamed(PreferenceScope.Workspace);
    bind(PreferenceProviders).toFactory(ctx => (scope: PreferenceScope) => ctx.container.getNamed(PreferenceProvider, scope));
    bind(PreferenceServiceImpl).toSelf().inSingletonScope();
    for (const serviceIdentifier of [PreferenceService, FrontendApplicationContribution]) {
        bind(serviceIdentifier).toDynamicValue(ctx => ctx.container.get(PreferenceServiceImpl)).inSingletonScope();
    }
    bind(PreferenceSchemaProvider).toSelf().inSingletonScope();
    bindContributionProvider(bind, PreferenceContribution);

    bind(PingService).toDynamicValue(ctx => {
        // let's reuse a simple and cheap service from this package
        const envServer: EnvVariablesServer = ctx.container.get(EnvVariablesServer);
        return {
            ping() {
                return envServer.getValue('does_not_matter');
            }
        };
    });
    bind(FrontendConnectionStatusService).toSelf().inSingletonScope();
    bind(ConnectionStatusService).toDynamicValue(ctx => ctx.container.get(FrontendConnectionStatusService)).inSingletonScope();
    bind(FrontendApplicationContribution).toDynamicValue(ctx => ctx.container.get(FrontendConnectionStatusService)).inSingletonScope();
    bind(ApplicationConnectionStatusContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toDynamicValue(ctx => ctx.container.get(ApplicationConnectionStatusContribution)).inSingletonScope();

    bind(ApplicationServer).toDynamicValue(ctx => {
        const provider = ctx.container.get(WebSocketConnectionProvider);
        return provider.createProxy<ApplicationServer>(applicationPath);
    }).inSingletonScope();

    bind(AboutDialog).toSelf().inSingletonScope();
    bind(AboutDialogProps).toConstantValue({ title: 'Theia' });

    bind(EnvVariablesServer).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        return connection.createProxy<EnvVariablesServer>(envVariablesPath);
    }).inSingletonScope();

    bind(ThemeService).toDynamicValue(() => ThemeService.get());
    bind(CommandContribution).to(ThemingCommandContribution).inSingletonScope();
});
