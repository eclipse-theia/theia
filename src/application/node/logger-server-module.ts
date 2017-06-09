/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { JsonRpcProxyFactory } from "../../messaging/common/proxy-factory";
import { ConnectionHandler } from "../../messaging/common";
import { ILoggerServer, ILoggerClient } from '../../application/common/logger-protocol';

export const loggerServerModule = new ContainerModule(bind => {
    bind<ConnectionHandler>(ConnectionHandler).toDynamicValue(ctx => {
        let loggerServer = ctx.container.get<ILoggerServer>(ILoggerServer);
        return {
            path: "/logger",
            onConnection(connection) {
                const proxyFactory = new JsonRpcProxyFactory<ILoggerClient>("/logger", loggerServer);
                proxyFactory.onConnection(connection);
                let proxy = proxyFactory.createProxy();
                loggerServer.setClient(proxy);
            }
        }
    }).inSingletonScope()
});