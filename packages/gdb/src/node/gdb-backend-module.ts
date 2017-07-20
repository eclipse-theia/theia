/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Container, ContainerModule } from 'inversify';
import {
    IMIDebugger, MIDebugger, MIInterpreter,
    IMIParser, MIParser, MIOutputParser
} from './mi';
import { bindGDBPreferences } from './gdb-preferences'
import { ConnectionHandler, JsonRpcConnectionHandler } from "@theia/core/lib/common/messaging";
import { IBaseTerminalClient } from '@theia/terminal/lib/common/base-terminal-protocol';
import { IGDBTerminalServer, gdbTerminalPath } from '../common/gdb-terminal-protocol';
import { GDBTerminalServer } from './gdb-terminal-server';
import { GDBTerminalProcess, GDBTerminalProcessFactory, GDBTerminalProcessOptions } from './gdb-terminal-process';
import { GDBRawProcess, GDBRawProcessFactory, GDBRawProcessOptions } from './gdb-raw-process';
import { IDebugSession } from '@theia/debug/lib/node/debug-session';
import { GDBDebugSession } from './gdb-debug-session';
import { GDBProbe } from './gdb-probe';

export default new ContainerModule(bind => {
    bindGDBPreferences(bind);
    bind<IMIDebugger>(IMIDebugger).to(MIDebugger);
    bind<MIInterpreter>(MIInterpreter).to(MIInterpreter);
    bind<IMIParser>(IMIParser).to(MIParser);
    bind<MIOutputParser>(MIOutputParser).toSelf();
    bind<GDBTerminalProcess>(GDBTerminalProcess).toSelf();
    bind<GDBRawProcess>(GDBRawProcess).toSelf();
    bind(IDebugSession).to(GDBDebugSession);
    bind(IGDBTerminalServer).to(GDBTerminalServer).inSingletonScope();
    bind<GDBDebugSession>(GDBDebugSession).toSelf();
    bind<GDBProbe>(GDBProbe).toSelf().inSingletonScope();

    bind(GDBTerminalProcessFactory).toFactory(ctx =>
        (options: GDBTerminalProcessOptions) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            child.bind(GDBTerminalProcessOptions).toConstantValue(options);
            return child.get(GDBTerminalProcess);
        }
    );

    bind(GDBRawProcessFactory).toFactory(ctx =>
        (options: GDBRawProcessOptions) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            child.bind(GDBRawProcessOptions).toConstantValue(options);
            return child.get(GDBRawProcess);
        });

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<IBaseTerminalClient>(gdbTerminalPath, client => {
            const terminalServer = ctx.container.get<IGDBTerminalServer>(IGDBTerminalServer);
            terminalServer.setClient(client);
            return terminalServer;
        })
    ).inSingletonScope();
});
