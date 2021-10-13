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

import { bindContributionProvider } from '@theia/core';
import { KeybindingContext, KeybindingContribution, QuickOpenContribution, WebSocketConnectionProvider, WidgetFactory } from '@theia/core/lib/browser';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { ContainerModule } from '@theia/core/shared/inversify';
import 'xterm/css/xterm.css';
import '../../src/browser/style/terminal.css';
import { RemoteTerminalServer, REMOTE_TERMINAL_PATH } from '../common/remote-terminal-protocol';
import { createCommonBindings } from '../common/terminal-common-module';
import { TerminalService } from './base/terminal-service';
import { TerminalWidget, TerminalWidgetOptions } from './base/terminal-widget';
import { RemoteTerminalService, RemoteTerminalServiceImpl } from './remote-terminal-service';
import { bindTerminalSearchWidgetFactory } from './search/terminal-search-container';
import { TerminalContribution } from './terminal-contribution';
import { TerminalCopyOnSelectionHandler } from './terminal-copy-on-selection-handler';
import { TerminalFrontendContribution } from './terminal-frontend-contribution';
import { TerminalActiveContext, TerminalSearchVisibleContext } from './terminal-keybinding-contexts';
import { LocalhostMatcher, URLMatcher } from './terminal-linkmatcher';
import { TerminalLinkmatcherDiffPost, TerminalLinkmatcherDiffPre } from './terminal-linkmatcher-diff';
import { TerminalLinkmatcherFiles } from './terminal-linkmatcher-files';
import { bindTerminalPreferences } from './terminal-preferences';
import { TerminalQuickOpenContribution, TerminalQuickOpenService } from './terminal-quick-open-service';
import { TerminalThemeService } from './terminal-theme-service';
import { TerminalWidgetImpl, TERMINAL_WIDGET_FACTORY_ID } from './terminal-widget-impl';

export default new ContainerModule(bind => {
    bindTerminalPreferences(bind);
    bind(KeybindingContext).to(TerminalActiveContext).inSingletonScope();
    bind(KeybindingContext).to(TerminalSearchVisibleContext).inSingletonScope();

    bind(TerminalWidget).to(TerminalWidgetImpl).inTransientScope();

    let terminalNum = 0;
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: TERMINAL_WIDGET_FACTORY_ID,
        createWidget: (options: TerminalWidgetOptions) => {
            const child = ctx.container.createChild();
            const counter = terminalNum++;
            const domId = options.id || 'terminal-' + counter;
            const widgetOptions: TerminalWidgetOptions = {
                title: 'Terminal ' + counter,
                useServerTitle: true,
                destroyTermOnClose: true,
                ...options
            };
            child.bind('terminal-dom-id').toConstantValue(domId);
            child.bind(TerminalWidgetOptions).toConstantValue(widgetOptions);
            bindTerminalSearchWidgetFactory(child);
            return child.get(TerminalWidget);
        }
    }));

    bind(TerminalQuickOpenService).toSelf().inSingletonScope();
    bind(TerminalCopyOnSelectionHandler).toSelf().inSingletonScope();

    bind(TerminalQuickOpenContribution).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, QuickOpenContribution]) {
        bind(identifier).toService(TerminalQuickOpenContribution);
    }

    bind(TerminalThemeService).toSelf().inSingletonScope();
    bind(TerminalFrontendContribution).toSelf().inSingletonScope();
    bind(TerminalService).toService(TerminalFrontendContribution);
    for (const identifier of [CommandContribution, MenuContribution, KeybindingContribution, TabBarToolbarContribution, ColorContribution]) {
        bind(identifier).toService(TerminalFrontendContribution);
    }

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

    bind(RemoteTerminalService).to(RemoteTerminalServiceImpl).inSingletonScope();
    bind(RemoteTerminalServer).toDynamicValue(
        ctx => ctx.container.get(WebSocketConnectionProvider).createProxy(REMOTE_TERMINAL_PATH)
    ).inSingletonScope();
});
