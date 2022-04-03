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

import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { ShellProcess, ShellProcessFactory, ShellProcessOptions } from './shell-process';
import { ITerminalServer, RemoteTerminalFactory, REMOTE_TERMINAL_ROUTE, terminalPath } from '../common/terminal-protocol';
import { IBaseTerminalServer, TerminalEnvironmentStore, TerminalWatcher, TERMINAL_ENVIRONMENT_STORE_PATH } from '../common/base-terminal-protocol';
import { TerminalServer } from './terminal-server';
import { IShellTerminalServer, shellTerminalPath } from '../common/shell-terminal-protocol';
import { ShellTerminalServer } from '../node/shell-terminal-server';
import { createCommonBindings } from '../common/terminal-common-module';
import { BackendAndFrontend, Event, ProxyProvider, ServiceContribution } from '@theia/core';
import { ProcessManager, TerminalProcess } from '@theia/process/lib/node';
import { RemoteTerminalImpl } from './remote-terminal-impl';

export const TerminalContainerModule = new ContainerModule(bind => {
    bind(ITerminalServer).to(TerminalServer).inSingletonScope();
    bind(IShellTerminalServer).to(ShellTerminalServer).inSingletonScope();
    bind(TerminalEnvironmentStore)
        .toDynamicValue(ctx => ctx.container.getNamed(ProxyProvider, BackendAndFrontend).getProxy(TERMINAL_ENVIRONMENT_STORE_PATH))
        .inSingletonScope();
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
    bind(ServiceContribution)
        .toDynamicValue(ctx => ServiceContribution.fromEntries(
            [terminalPath, () => ctx.container.get(ITerminalServer)],
            [shellTerminalPath, () => ctx.container.get(IShellTerminalServer)]
        ))
        .inSingletonScope()
        .whenTargetNamed(BackendAndFrontend);

    bind(ServiceContribution)
        .toDynamicValue(ctx => {
            const remoteTerminalFactory = ctx.container.get(RemoteTerminalFactory);
            return ServiceContribution.fromRoute(
                REMOTE_TERMINAL_ROUTE,
                (matched, params, lifecycle) => lifecycle.track(remoteTerminalFactory(parseInt(params.terminalId, 10))).ref()
            );
        })
        .inSingletonScope();
});

export default new ContainerModule(bind => {
    bind(ContainerModule)
        .toConstantValue(TerminalContainerModule)
        .whenTargetNamed(BackendAndFrontend);

    bind(ShellProcess).toSelf().inTransientScope();
    bind(ShellProcessFactory).toFactory(ctx => (options: ShellProcessOptions) => {
        const child = ctx.container.createChild();
        child.bind(ShellProcessOptions).toConstantValue(options);
        return child.get(ShellProcess);
    });

    bind(RemoteTerminalFactory)
        .toDynamicValue(ctx => {
            const processManager = ctx.container.get(ProcessManager);
            return terminalId => {
                const term = processManager.get(terminalId);
                if (term instanceof TerminalProcess) {
                    return new RemoteTerminalImpl(term);
                }
                throw new Error(`no terminal for id=${terminalId}`);
            };
        })
        .inSingletonScope();

    createCommonBindings(bind);
});

/**
 * @deprecated since 1.26.0
 */
export function bindTerminalServer(bind: interfaces.Bind, { path, identifier, constructor }: {
    path: string,
    identifier: interfaces.ServiceIdentifier<IBaseTerminalServer>,
    constructor: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new(...args: any[]): IBaseTerminalServer;
    }
}): void {
    bind<IBaseTerminalServer>(identifier).to(constructor).inSingletonScope();
    bind(ServiceContribution)
        .toDynamicValue(ctx => ServiceContribution.fromEntries(
            [path, () => ctx.container.get(identifier)]
        ))
        .inSingletonScope();
}
