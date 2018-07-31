/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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
import { ConnectionHandler, JsonRpcConnectionHandler } from '../common/messaging';
import { ILogger, LoggerFactory, Logger, setRootLogger, LoggerName, rootLoggerName } from '../common/logger';
import { ILoggerServer, ILoggerClient, loggerPath } from '../common/logger-protocol';
import { ConsoleLoggerServer } from './console-logger-server';
import { LoggerWatcher } from '../common/logger-watcher';
import { BackendApplicationContribution } from './backend-application';
import { CliContribution } from './cli';
import { LogLevelCliContribution } from './logger-cli-contribution';

export function bindLogger(bind: interfaces.Bind): void {
    bind(LoggerName).toConstantValue(rootLoggerName);
    bind(ILogger).to(Logger).inSingletonScope().whenTargetIsDefault();
    bind(LoggerWatcher).toSelf().inSingletonScope();
    bind(ILoggerServer).to(ConsoleLoggerServer).inSingletonScope();
    bind(LogLevelCliContribution).toSelf().inSingletonScope();
    bind(CliContribution).toDynamicValue(ctx => ctx.container.get(LogLevelCliContribution));
    bind(LoggerFactory).toFactory(ctx =>
        (name: string) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            child.bind(ILogger).to(Logger).inTransientScope();
            child.bind(LoggerName).toConstantValue(name);
            return child.get(ILogger);
        }
    );
}

/**
 * IMPORTANT: don't use in tests, since it overrides console
 */
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
