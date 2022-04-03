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

import { ContainerModule } from 'inversify';
import { BackendAndFrontend, ProxyProvider } from '../common';
import { ILogger, Logger, LoggerFactory, LoggerName, rootLoggerName, setRootLogger } from '../common/logger';
import { ConsoleLogger, ILoggerServer, loggerPath } from '../common/logger-protocol';
import { FrontendApplicationContribution } from './frontend-application';

export const loggerFrontendModule = new ContainerModule(bind => {
    bind(FrontendApplicationContribution)
        .toDynamicValue(ctx => ({
            initialize(): void {
                setRootLogger(ctx.container.get<ILogger>(ILogger));
            }
        }))
        .inSingletonScope();
    bind(LoggerName).toConstantValue(rootLoggerName);
    bind(ILogger).to(Logger).inSingletonScope().whenTargetIsDefault();
    bind(ILoggerServer)
        .toDynamicValue(ctx => {
            const loggerServer = ctx.container.getNamed(ProxyProvider, BackendAndFrontend).getProxy(loggerPath);
            // Do some switcharoo to only override the `log` method from the `ILoggerServer` remote proxy:
            return new Proxy(loggerServer, {
                get: (target, property: keyof ILoggerServer, receiver): ILoggerServer[keyof ILoggerServer] => {
                    if (property === 'log') {
                        return (name, logLevel, message, params) => {
                            ConsoleLogger.log(name, logLevel, message, params);
                            return target.log(name, logLevel, message, params);
                        };
                    }
                    return target[property];
                }
            });
        })
        .inSingletonScope();
    bind(LoggerFactory).toFactory(ctx => (name: string) => {
        const child = ctx.container.createChild();
        child.bind(ILogger).to(Logger).inTransientScope();
        child.bind(LoggerName).toConstantValue(name);
        return child.get(ILogger);
    });
});
