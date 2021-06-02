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

import { ContainerModule, Container, interfaces } from '@theia/core/shared/inversify';
import { TerminalBackendContribution } from './terminal-backend-contribution';
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core/lib/common/messaging';
import { ShellProcess, ShellProcessFactory, ShellProcessOptions } from './shell-process';
import { ITerminalServer, terminalPath } from '../common/terminal-protocol';
import { IBaseTerminalClient, DispatchingBaseTerminalClient, IBaseTerminalServer } from '../common/base-terminal-protocol';
import { TerminalServer } from './terminal-server';
import { IShellTerminalServer, shellTerminalPath } from '../common/shell-terminal-protocol';
import { ShellTerminalServer } from '../node/shell-terminal-server';
import { TerminalWatcher } from '../common/terminal-watcher';
import { createCommonBindings } from '../common/terminal-common-module';
import { MessagingService } from '@theia/core/lib/node/messaging/messaging-service';

export function bindTerminalServer(bind: interfaces.Bind, { path, identifier, constructor }: {
    path: string,
    identifier: interfaces.ServiceIdentifier<IBaseTerminalServer>,
    constructor: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new(...args: any[]): IBaseTerminalServer;
    }
}): void {
    const dispatchingClient = new DispatchingBaseTerminalClient();
    bind<IBaseTerminalServer>(identifier).to(constructor).inSingletonScope().onActivation((context, terminalServer) => {
        terminalServer.setClient(dispatchingClient);
        dispatchingClient.push(context.container.get(TerminalWatcher).getTerminalClient());
        terminalServer.setClient = () => {
            throw new Error('use TerminalWatcher');
        };
        return terminalServer;
    });
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<IBaseTerminalClient>(path, client => {
            const disposable = dispatchingClient.push(client);
            client.onDidCloseConnection(() => disposable.dispose());
            return ctx.container.get(identifier);
        })
    ).inSingletonScope();
}

export default new ContainerModule(bind => {
    bind(MessagingService.Contribution).to(TerminalBackendContribution).inSingletonScope();

    bind(ShellProcess).toSelf().inTransientScope();
    bind(ShellProcessFactory).toFactory(ctx =>
        (options: ShellProcessOptions) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            child.bind(ShellProcessOptions).toConstantValue(options);
            return child.get(ShellProcess);
        }
    );

    bind(TerminalWatcher).toSelf().inSingletonScope();
    bindTerminalServer(bind, {
        path: terminalPath,
        identifier: ITerminalServer,
        constructor: TerminalServer
    });
    bindTerminalServer(bind, {
        path: shellTerminalPath,
        identifier: IShellTerminalServer,
        constructor: ShellTerminalServer
    });

    createCommonBindings(bind);
});
