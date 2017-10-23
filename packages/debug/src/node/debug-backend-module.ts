/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { ConnectionHandler, JsonRpcConnectionHandler } from "@theia/core/lib/common/messaging";
import { IDebugSession, IDebugSessionFactory } from './debug-session';
import { DebugSessionManager } from './debug-session-manager';
import { IDebugServer, IDebugClient, debugPath } from '../common/debug-protocol';
import { DebugServer } from './debug-server';

export default new ContainerModule(bind => {
    bind<DebugSessionManager>(DebugSessionManager).toSelf().inSingletonScope();
    bind(IDebugSessionFactory).toAutoFactory(IDebugSession);
    bind(IDebugServer).to(DebugServer).inSingletonScope();

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<IDebugClient>(debugPath, client => {
            const server = ctx.container.get<IDebugServer>(IDebugServer);
            server.setClient(client);
            return server;
        })
    ).inSingletonScope();
});
