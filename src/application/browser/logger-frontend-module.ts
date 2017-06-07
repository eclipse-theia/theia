/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, Container } from 'inversify';
import { WebSocketConnectionProvider } from '../../messaging/browser/connection';
import { ILogger, LoggerFactory, LoggerOptions, Logger } from '../common/logger';
import { ILoggerServer } from '../common/logger-protocol';
import { LoggerWatcher } from '../common/logger-watcher';

export const loggerFrontendModule = new ContainerModule(bind => {
    bind(ILogger).to(Logger).inSingletonScope();
    bind(LoggerWatcher).toSelf().inSingletonScope();
    bind(ILoggerServer).toDynamicValue(ctx => {
        const loggerWatcher = ctx.container.get(LoggerWatcher);
        const connection = ctx.container.get(WebSocketConnectionProvider);
        return connection.createProxy<ILoggerServer>("/logger", loggerWatcher.getLoggerClient());
    }).inSingletonScope();
    bind(LoggerFactory).toFactory(ctx =>
        (options?: any) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            child.bind(ILogger).to(Logger).inTransientScope();
            child.bind(LoggerOptions).toConstantValue(options);
            return child.get(ILogger);
        }
    );
});
