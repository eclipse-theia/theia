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
import { TerminalFrontendContribution } from './terminal-frontend-contribution';
import { TERMINAL_WIDGET_FACTORY_ID, TERMINAL_WIDGET_OVERRIDE } from './terminal-contract';
import { TerminalWidget, TerminalWidgetOptions } from './base/terminal-widget';
import { ITerminalServer, terminalPath } from '../common/terminal-protocol';
import { TerminalWatcher } from '../common/terminal-watcher';
import { IShellTerminalServer, shellTerminalPath, ShellTerminalServerProxy } from '../common/shell-terminal-protocol';
import { TerminalService } from './base/terminal-service';
import { bindTerminalPreferences } from '../common/terminal-preferences';
import { TerminalContribution } from './terminal-contribution';
import { TerminalCreationHandler } from './terminal-creation-handler';
import { TerminalShellHandler } from './terminal-shell-handler';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { TerminalThemeService } from './terminal-theme-service';
import { QuickAccessContribution } from '@theia/core/lib/browser/quick-input/quick-access';
import { TerminalQuickOpenService, TerminalQuickOpenContribution } from './terminal-quick-open-service';
import { TerminalCopyOnSelectionHandler } from './terminal-copy-on-selection-handler';
import {
    ContributedTerminalProfileStore, DefaultProfileStore, DefaultTerminalProfileService,
    TerminalProfileService, TerminalProfileStore, UserTerminalProfileStore
} from './terminal-profile-service';
import { TerminalCommandHistoryStateFactory, TerminalCommandHistoryStateImpl } from './terminal-command-history';

/** Guard against loading the link provider module more than once. */
const TERMINAL_LINK_MODULE_LOADED = Symbol.for('theiaTerminalLinkModuleLoaded');

export default new ContainerModule(bind => {
    bindTerminalPreferences(bind);

    bind(TerminalWatcher).toSelf().inSingletonScope();

    let terminalNum = 0;
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: TERMINAL_WIDGET_FACTORY_ID,
        createWidget: async (options: TerminalWidgetOptions) => {
            /*
             * Lazy widget factory: the heavy xterm stack (terminal-widget-impl,
             * the search widget and the link providers) is loaded via dynamic
             * import() on first terminal creation and stays out of application
             * startup.
             */
            const { TerminalWidgetImpl: TerminalWidgetImplClass } = await import('./terminal-widget-impl');
            const { TerminalSearchWidgetFactory } = await import('./search/terminal-search-widget');
            const { createTerminalSearchFactory } = await import('./search/terminal-search-container');
            if (!ctx.container.isBound(TERMINAL_LINK_MODULE_LOADED)) {
                ctx.container.load((await import('./terminal-link-frontend-module')).default);
                ctx.container.bind(TERMINAL_LINK_MODULE_LOADED).toConstantValue(true);
            }

            // see TERMINAL_WIDGET_OVERRIDE
            let TerminalWidgetClass = TerminalWidgetImplClass;
            if (ctx.container.isBound(TERMINAL_WIDGET_OVERRIDE)) {
                TerminalWidgetClass = await ctx.container.getAsync<typeof TerminalWidgetImplClass>(TERMINAL_WIDGET_OVERRIDE);
            }

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

            child.bind(TerminalWidget).to(TerminalWidgetClass).inTransientScope();
            child.bind(TerminalSearchWidgetFactory).toDynamicValue(context =>
                createTerminalSearchFactory(context.container));

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
