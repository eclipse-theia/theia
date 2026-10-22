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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/browser/style/terminal.css';
import 'xterm/css/xterm.css';

import { ContainerModule, Container } from '@theia/core/shared/inversify';
import { CommandContribution, MenuContribution, nls } from '@theia/core/lib/common';
import { bindRootContributionProvider } from '@theia/core';
import { KeybindingContribution, WebSocketConnectionProvider, WidgetFactory, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { TerminalFrontendContribution } from './terminal-frontend-contribution.js';
import { TerminalWidgetImpl, TERMINAL_WIDGET_FACTORY_ID } from './terminal-widget-impl.js';
import { TerminalWidget, TerminalWidgetOptions } from './base/terminal-widget.js';
import { ITerminalServer, terminalPath } from '../common/terminal-protocol.js';
import { TerminalWatcher } from '../common/terminal-watcher.js';
import { IShellTerminalServer, shellTerminalPath, ShellTerminalServerProxy } from '../common/shell-terminal-protocol.js';
import { TerminalService } from './base/terminal-service.js';
import { bindTerminalPreferences } from '../common/terminal-preferences.js';
import { TerminalContribution } from './terminal-contribution.js';
import { TerminalCreationHandler } from './terminal-creation-handler.js';
import { TerminalShellHandler } from './terminal-shell-handler.js';
import { TerminalSearchWidgetFactory } from './search/terminal-search-widget.js';
import { TerminalQuickOpenService, TerminalQuickOpenContribution } from './terminal-quick-open-service.js';
import { createTerminalSearchFactory } from './search/terminal-search-container.js';
import { TerminalCopyOnSelectionHandler } from './terminal-copy-on-selection-handler.js';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { TerminalThemeService } from './terminal-theme-service.js';
import { QuickAccessContribution } from '@theia/core/lib/browser/quick-input/quick-access';
import { createXtermLinkFactory, TerminalLinkProvider, TerminalLinkProviderContribution, XtermLinkFactory } from './terminal-link-provider.js';
import { UrlLinkProvider } from './terminal-url-link-provider.js';
import { FileDiffPostLinkProvider, FileDiffPreLinkProvider, FileLinkProvider, LocalFileLinkProvider } from './terminal-file-link-provider.js';
import { FileUriLinkProvider } from './terminal-file-uri-link-provider.js';
import {
    ContributedTerminalProfileStore, DefaultProfileStore, DefaultTerminalProfileService,
    TerminalProfileService, TerminalProfileStore, UserTerminalProfileStore
} from './terminal-profile-service.js';
import { TerminalCommandHistoryStateFactory, TerminalCommandHistoryStateImpl } from './terminal-command-history.js';

export default new ContainerModule(bind => {
    bindTerminalPreferences(bind);

    bind(TerminalWidget).to(TerminalWidgetImpl).inTransientScope();
    bind(TerminalWatcher).toSelf().inSingletonScope();

    let terminalNum = 0;
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: TERMINAL_WIDGET_FACTORY_ID,
        createWidget: (options: TerminalWidgetOptions) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            const counter = terminalNum++;
            const domId = options.id || 'terminal-' + counter;
            const widgetOptions: TerminalWidgetOptions = {
                title: nls.localizeByDefault('Terminal {0}', counter),
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

    bind(ITerminalServer).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        const terminalWatcher = ctx.container.get(TerminalWatcher);
        return connection.createProxy<ITerminalServer>(terminalPath, terminalWatcher.getTerminalClient());
    }).inSingletonScope();

    bind(ShellTerminalServerProxy).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        const terminalWatcher = ctx.container.get(TerminalWatcher);
        return connection.createProxy<IShellTerminalServer>(shellTerminalPath, terminalWatcher.getTerminalClient());
    }).inSingletonScope();
    bind(IShellTerminalServer).toService(ShellTerminalServerProxy);

    bindRootContributionProvider(bind, TerminalContribution);
    bindRootContributionProvider(bind, TerminalCreationHandler);
    bind(TerminalShellHandler).toSelf().inSingletonScope();
    bind(TerminalCreationHandler).toService(TerminalShellHandler);

    // terminal link provider contribution point
    bindRootContributionProvider(bind, TerminalLinkProvider);
    bind(TerminalLinkProviderContribution).toSelf().inSingletonScope();
    bind(TerminalContribution).toService(TerminalLinkProviderContribution);
    bind(XtermLinkFactory).toFactory(createXtermLinkFactory);

    // default terminal link provider
    bind(UrlLinkProvider).toSelf().inSingletonScope();
    bind(TerminalLinkProvider).toService(UrlLinkProvider);
    bind(FileUriLinkProvider).toSelf().inSingletonScope();
    bind(TerminalLinkProvider).toService(FileUriLinkProvider);
    bind(FileLinkProvider).toSelf().inSingletonScope();
    bind(TerminalLinkProvider).toService(FileLinkProvider);
    bind(FileDiffPreLinkProvider).toSelf().inSingletonScope();
    bind(TerminalLinkProvider).toService(FileDiffPreLinkProvider);
    bind(FileDiffPostLinkProvider).toSelf().inSingletonScope();
    bind(TerminalLinkProvider).toService(FileDiffPostLinkProvider);
    bind(LocalFileLinkProvider).toSelf().inSingletonScope();
    bind(TerminalLinkProvider).toService(LocalFileLinkProvider);

    bind(ContributedTerminalProfileStore).to(DefaultProfileStore).inSingletonScope();
    bind(UserTerminalProfileStore).to(DefaultProfileStore).inSingletonScope();
    bind(TerminalProfileService).toDynamicValue(ctx => {
        const userStore = ctx.container.get<TerminalProfileStore>(UserTerminalProfileStore);
        const contributedStore = ctx.container.get<TerminalProfileStore>(ContributedTerminalProfileStore);
        return new DefaultTerminalProfileService(userStore, contributedStore);
    }).inSingletonScope();

    bind(FrontendApplicationContribution).toService(TerminalFrontendContribution);

    bind(TerminalCommandHistoryStateImpl).toSelf().inTransientScope();
    bind(TerminalCommandHistoryStateFactory).toFactory(ctx =>
        () => ctx.container.get(TerminalCommandHistoryStateImpl)
    );
});
