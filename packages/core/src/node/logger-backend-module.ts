// *****************************************************************************
// Copyright (C) 2017 Ericsson and others.
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

import { ContainerModule, interfaces } from 'inversify';
import { BackendAndFrontend, ServiceContribution } from '../common';
import { ILogger, Logger, LoggerFactory, LoggerName, rootLoggerName, setRootLogger } from '../common/logger';
import { ILoggerServer, loggerPath } from '../common/logger-protocol';
import { BackendApplicationContribution } from './backend-application';
import { CliContribution } from './cli';
import { ConsoleLoggerServer } from './console-logger-server';
import { LogLevelCliContribution } from './logger-cli-contribution';

export function bindLogger(bind: interfaces.Bind, props?: {
    onLoggerServerActivation?: (context: interfaces.Context, server: ILoggerServer) => void
}): void {
    bind(LoggerName).toConstantValue(rootLoggerName);
    bind(ILogger).to(Logger).inSingletonScope().whenTargetIsDefault();
    bind(ILoggerServer)
        .to(ConsoleLoggerServer)
        .inSingletonScope()
        .onActivation((ctx, server) => {
            props?.onLoggerServerActivation?.(ctx, server);
            return server;
        });
    bind(LogLevelCliContribution).toSelf().inSingletonScope();
    bind(CliContribution).toService(LogLevelCliContribution);
    bind(LoggerFactory).toFactory(ctx => (name: string) => {
        const child = ctx.container.createChild();
        child.bind(ILogger).to(Logger).inTransientScope();
        child.bind(LoggerName).toConstantValue(name);
        return child.get(ILogger);
    });
}

/**
 * IMPORTANT: don't use in tests, since it overrides console
 */
export const loggerBackendModule = new ContainerModule(bind => {
    bindLogger(bind);
    bind(BackendApplicationContribution)
        .toDynamicValue(ctx => ({
            initialize(): void {
                setRootLogger(ctx.container.get<ILogger>(ILogger));
            }
        }))
        .inSingletonScope();
    bind(ServiceContribution)
        .toDynamicValue(ctx => ServiceContribution.fromEntries(
            [loggerPath, () => ctx.container.get(ILoggerServer)]
        ))
        .inSingletonScope()
        .whenTargetNamed(BackendAndFrontend);
});
