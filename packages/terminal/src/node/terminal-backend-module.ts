/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, Container } from 'inversify';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { TerminalBackendContribution } from "./terminal-backend-contribution";
import { ConnectionHandler, JsonRpcConnectionHandler } from "@theia/core/lib/common/messaging";
import { ShellProcess, ShellProcessFactory, ShellProcessOptions } from './shell-process';
import { ITerminalServer, terminalPath } from '../common/terminal-protocol';
import { IBaseTerminalClient } from '../common/base-terminal-protocol';
import { TerminalServer } from './terminal-server';
import { IShellTerminalServer, shellTerminalPath } from '../common/shell-terminal-protocol';
import { ShellTerminalServer } from '../node/shell-terminal-server';
import { TerminalWatcher } from '../common/terminal-watcher';
import { createCommonBindings } from '../common/terminal-common-module';

export default new ContainerModule(bind => {
    bind(BackendApplicationContribution).to(TerminalBackendContribution);
    bind(ITerminalServer).to(TerminalServer).inSingletonScope();
    bind(IShellTerminalServer).to(ShellTerminalServer).inSingletonScope();
    bind(ShellProcess).toSelf().inTransientScope();
    bind(TerminalWatcher).toSelf().inSingletonScope();

    bind(ShellProcessFactory).toFactory(ctx =>
        (options: ShellProcessOptions) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            child.bind(ShellProcessOptions).toConstantValue(options);
            return child.get(ShellProcess);
        }
    );

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<IBaseTerminalClient>(terminalPath, client => {
            const terminalServer = ctx.container.get<ITerminalServer>(ITerminalServer);
            terminalServer.setClient(client);
            return terminalServer;
        })
    ).inSingletonScope();

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<IBaseTerminalClient>(shellTerminalPath, client => {
            const shellTerminalServer = ctx.container.get<IShellTerminalServer>(IShellTerminalServer);
            shellTerminalServer.setClient(client);
            return shellTerminalServer;
        })
    ).inSingletonScope();

    createCommonBindings(bind);
});
