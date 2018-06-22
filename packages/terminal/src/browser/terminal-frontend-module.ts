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

import { ContainerModule, Container } from 'inversify';
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { KeybindingContribution, WebSocketConnectionProvider, WidgetFactory, KeybindingContext } from '@theia/core/lib/browser';
import { TerminalFrontendContribution } from './terminal-frontend-contribution';
import { TerminalWidget, TerminalWidgetOptions, TERMINAL_WIDGET_FACTORY_ID } from './terminal-widget';
import { ITerminalServer, terminalPath } from '../common/terminal-protocol';
import { TerminalWatcher } from '../common/terminal-watcher';
import { IShellTerminalServer, shellTerminalPath, ShellTerminalServerProxy } from '../common/shell-terminal-protocol';
import { TerminalActiveContext } from './terminal-keybinding-contexts';
import { createCommonBindings } from '../common/terminal-common-module';

import '../../src/browser/terminal.css';
import 'xterm/lib/xterm.css';

export default new ContainerModule(bind => {
    bind(KeybindingContext).to(TerminalActiveContext).inSingletonScope();

    bind(TerminalWidget).toSelf().inTransientScope();
    bind(TerminalWatcher).toSelf().inSingletonScope();

    let terminalNum = 0;
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: TERMINAL_WIDGET_FACTORY_ID,
        createWidget: (options: TerminalWidgetOptions) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            const counter = terminalNum++;
            child.bind(TerminalWidgetOptions).toConstantValue({
                id: 'terminal-' + counter,
                caption: 'Terminal ' + counter,
                label: 'Terminal ' + counter,
                destroyTermOnClose: true,
                ...options
            });
            return child.get(TerminalWidget);
        }
    }));

    bind(TerminalFrontendContribution).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, MenuContribution, KeybindingContribution]) {
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

    createCommonBindings(bind);
});
