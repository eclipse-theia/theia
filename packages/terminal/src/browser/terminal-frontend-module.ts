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

import { ContainerModule, Container, interfaces } from 'inversify';
import { WebSocketConnectionProvider, KeybindingContext, KeybindingContribution } from '@theia/core/lib/browser';
import { ITerminalServer, terminalPath } from '../common/terminal-protocol';
import { TerminalWatcher } from '../common/terminal-watcher';
import { IShellTerminalServer, shellTerminalPath, ShellTerminalServerProxy } from '../common/shell-terminal-protocol';
import { createCommonBindings } from '../common/terminal-common-module';
import { TerminalActiveContext } from './terminal-keybinding-contexts';
import { TerminalService } from './terminal-service';
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { TerminalFrontendContribution } from './terminal-frontend-contribution';
import { DefaultTerminalClient, TerminalClient, TerminalClientOptions } from './terminal-client';

export default new ContainerModule(bind => {
    bind(KeybindingContext).to(TerminalActiveContext).inSingletonScope();
    bind(TerminalWatcher).toSelf().inSingletonScope();

    bind(DefaultTerminalClient).toSelf();
    bind(TerminalClient).toService(DefaultTerminalClient);

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

    bind(TerminalFrontendContribution).toSelf().inSingletonScope();
    bind(TerminalService).toService(TerminalFrontendContribution);
    for (const identifier of [CommandContribution, MenuContribution, KeybindingContribution, TabBarToolbarContribution]) {
        bind(identifier).toService(TerminalFrontendContribution);
    }

    bind<interfaces.Factory<TerminalClient>>('Factory<TerminalClient>').toFactory<TerminalClient>((context: interfaces.Context) =>
        (options: TerminalClientOptions) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = context.container;
            child.bind(TerminalClientOptions).toConstantValue(options);

            return child.get(TerminalClient);
        }
    );

    createCommonBindings(bind);
});
