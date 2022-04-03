// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/browser/style/terminal.css';
import 'xterm/css/xterm.css';

import { ContainerModule, Container } from '@theia/core/shared/inversify';
import { BackendAndFrontend, CommandContribution, MenuContribution, ProxyProvider, ServiceContribution } from '@theia/core/lib/common';
import { bindContributionProvider, Event } from '@theia/core';
import { KeybindingContribution, WidgetFactory, KeybindingContext, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { TerminalFrontendContribution } from './terminal-frontend-contribution';
import { TerminalWidgetImpl, TERMINAL_WIDGET_FACTORY_ID } from './terminal-widget-impl';
import { TerminalWidget, TerminalWidgetOptions } from './base/terminal-widget';
import { ITerminalServer, RemoteTerminal, RemoteTerminalFactory, REMOTE_TERMINAL_ROUTE, terminalPath } from '../common/terminal-protocol';
import { IShellTerminalServer, shellTerminalPath, ShellTerminalServerProxy } from '../common/shell-terminal-protocol';
import { TerminalActiveContext, TerminalSearchVisibleContext } from './terminal-keybinding-contexts';
import { createCommonBindings } from '../common/terminal-common-module';
import { TerminalService } from './base/terminal-service';
import { bindTerminalPreferences } from './terminal-preferences';
import { URLMatcher, LocalhostMatcher } from './terminal-linkmatcher';
import { TerminalContribution } from './terminal-contribution';
import { TerminalLinkmatcherFiles } from './terminal-linkmatcher-files';
import { TerminalLinkmatcherDiffPre, TerminalLinkmatcherDiffPost } from './terminal-linkmatcher-diff';
import { TerminalSearchWidgetFactory } from './search/terminal-search-widget';
import { TerminalQuickOpenService, TerminalQuickOpenContribution } from './terminal-quick-open-service';
import { createTerminalSearchFactory } from './search/terminal-search-container';
import { TerminalCopyOnSelectionHandler } from './terminal-copy-on-selection-handler';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { TerminalThemeService } from './terminal-theme-service';
import { QuickAccessContribution } from '@theia/core/lib/browser/quick-input/quick-access';
import { TerminalEnvironmentStore, TerminalWatcher, TERMINAL_ENVIRONMENT_STORE_PATH } from '../common/base-terminal-protocol';
import { TerminalEnvironmentStoreImpl } from './terminal-environment-store-impl';

export default new ContainerModule(bind => {
    bindTerminalPreferences(bind);
    bind(KeybindingContext).to(TerminalActiveContext).inSingletonScope();
    bind(KeybindingContext).to(TerminalSearchVisibleContext).inSingletonScope();

    bind(TerminalWidget).to(TerminalWidgetImpl).inTransientScope();

    bind(RemoteTerminalFactory)
        .toDynamicValue(ctx => terminalId => ctx.container.getNamed(ProxyProvider, BackendAndFrontend).getProxy<RemoteTerminal>(
            REMOTE_TERMINAL_ROUTE.reverse({ terminalId: terminalId.toString(10) }) as string
        ))
        .inSingletonScope();

    let terminalNum = 0;
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: TERMINAL_WIDGET_FACTORY_ID,
        createWidget: (options: TerminalWidgetOptions) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            const counter = terminalNum++;
            const domId = options.id || 'terminal-' + counter;
            const widgetOptions: TerminalWidgetOptions = {
                title: 'Terminal ' + counter,
                useServerTitle: true,
                destroyTermOnClose: true,
                ...options
            };
            child.bind(TerminalWidgetOptions).toConstantValue(widgetOptions);
            child.bind('terminal-dom-id').toConstantValue(domId);

            child.bind(TerminalSearchWidgetFactory).toDynamicValue(context => createTerminalSearchFactory(context.container));

            return child.get(TerminalWidget);
        }
    }));

    bind(TerminalQuickOpenService).toSelf().inSingletonScope();
    bind(TerminalCopyOnSelectionHandler).toSelf().inSingletonScope();

    bind(TerminalQuickOpenContribution).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, QuickAccessContribution]) {
        bind(identifier).toService(TerminalQuickOpenContribution);
    }

    bind(TerminalThemeService).toSelf().inSingletonScope();
    bind(TerminalFrontendContribution).toSelf().inSingletonScope();
    bind(TerminalService).toService(TerminalFrontendContribution);
    for (const identifier of [CommandContribution, MenuContribution, KeybindingContribution, TabBarToolbarContribution, ColorContribution]) {
        bind(identifier).toService(TerminalFrontendContribution);
    }

    bind(TerminalEnvironmentStore).to(TerminalEnvironmentStoreImpl).inSingletonScope();
    bind(ServiceContribution)
        .toDynamicValue(ctx => ServiceContribution.fromEntries(
            [TERMINAL_ENVIRONMENT_STORE_PATH, () => ctx.container.get(TerminalEnvironmentStore)]
        ))
        .inSingletonScope();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bind<any>(ITerminalServer)
        .toDynamicValue(ctx => ctx.container.getNamed(ProxyProvider, BackendAndFrontend).getProxy(terminalPath))
        .inSingletonScope();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bind<any>(ShellTerminalServerProxy)
        .toDynamicValue(ctx => ctx.container.getNamed(ProxyProvider, BackendAndFrontend).getProxy(shellTerminalPath))
        .inSingletonScope();

    bind(IShellTerminalServer).toService(ShellTerminalServerProxy);

    bind(TerminalWatcher)
        .toDynamicValue(ctx => {
            const terminalServer = ctx.container.get(ITerminalServer);
            const shellServer = ctx.container.get(IShellTerminalServer);
            return {
                onTerminalError: Event.or(terminalServer.onTerminalError, shellServer.onTerminalError),
                onTerminalExitChanged: Event.or(terminalServer.onTerminalExitChanged, shellServer.onTerminalExitChanged)
            };
        })
        .inSingletonScope();

    createCommonBindings(bind);

    // link matchers
    bindContributionProvider(bind, TerminalContribution);

    bind(URLMatcher).toSelf().inSingletonScope();
    bind(TerminalContribution).toService(URLMatcher);

    bind(LocalhostMatcher).toSelf().inSingletonScope();
    bind(TerminalContribution).toService(LocalhostMatcher);

    bind(TerminalLinkmatcherFiles).toSelf().inSingletonScope();
    bind(TerminalContribution).toService(TerminalLinkmatcherFiles);

    bind(TerminalLinkmatcherDiffPre).toSelf().inSingletonScope();
    bind(TerminalContribution).toService(TerminalLinkmatcherDiffPre);

    bind(TerminalLinkmatcherDiffPost).toSelf().inSingletonScope();
    bind(TerminalContribution).toService(TerminalLinkmatcherDiffPost);

    bind(FrontendApplicationContribution).to(TerminalFrontendContribution);
});
