/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, Container, interfaces } from 'inversify';
import { ConnectionHandler, JsonRpcConnectionHandler } from "../common/messaging";
import { ILogger, LoggerFactory, LoggerOptions, Logger, setRootLogger } from '../common/logger';
import { ILoggerServer, ILoggerClient, loggerPath, LoggerServerOptions } from '../common/logger-protocol';
import { BunyanLoggerServer, LogLevelCliContribution } from './bunyan-logger-server';
import { LoggerWatcher } from '../common/logger-watcher';
import { BackendApplicationContribution } from './backend-application';
import { CliContribution } from './cli';

export function bindLogger(bind: interfaces.Bind): void {
    bind(ILogger).to(Logger).inSingletonScope().whenTargetIsDefault();
    bind(LoggerWatcher).toSelf().inSingletonScope();
    bind(ILoggerServer).to(BunyanLoggerServer).inSingletonScope();
    bind(LogLevelCliContribution).toSelf().inSingletonScope();
    bind(CliContribution).toDynamicValue(ctx => ctx.container.get(LogLevelCliContribution));
    bind(LoggerServerOptions).toDynamicValue(ctx => {
        const contrib = ctx.container.get(LogLevelCliContribution);
        return {
            name: "Theia",
            level: contrib.logLevel
        };
    }
    ).inSingletonScope();
    bind(LoggerFactory).toFactory(ctx =>
        (options?: any) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            child.bind(ILogger).to(Logger).inTransientScope();
            child.bind(LoggerOptions).toConstantValue(options);
            return child.get(ILogger);
        }
    );
}

export const loggerBackendModule = new ContainerModule(bind => {
    bind(BackendApplicationContribution).toDynamicValue(ctx =>
        ({
            initialize() {
                setRootLogger(ctx.container.get<ILogger>(ILogger));
            }
        }));

    bindLogger(bind);

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<ILoggerClient>(loggerPath, client => {
            const loggerServer = ctx.container.get<ILoggerServer>(ILoggerServer);
            loggerServer.setClient(client);
            return loggerServer;
        })
    ).inSingletonScope();
});
