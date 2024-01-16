// *****************************************************************************
// Copyright (C) 2023 EclipseSource and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule, Container } from 'inversify';
import { ILoggerServer, ILoggerClient, LogLevel, ConsoleLogger } from '../common/logger-protocol';
import { ILogger, Logger, LoggerFactory, LoggerName } from '../common/logger';

// is loaded directly after the regular logger frontend module
export const loggerFrontendOnlyModule = new ContainerModule((bind, unbind, isBound, rebind) => {
    const logger: ILoggerServer = {
        setLogLevel: async (_name: string, _logLevel: number): Promise<void> => { },
        getLogLevel: async (_name: string): Promise<number> => LogLevel.INFO,
        log: async (name: string, logLevel: number, message: string, params: unknown[]): Promise<void> => {
            ConsoleLogger.log(name, logLevel, message, params);

        },
        child: async (_name: string): Promise<void> => { },
        dispose: (): void => {
        },
        setClient: (_client: ILoggerClient | undefined): void => {
        }
    };
    if (isBound(ILoggerServer)) {
        rebind(ILoggerServer).toConstantValue(logger);
    } else {
        bind(ILoggerServer).toConstantValue(logger);
    }

    if (isBound(ILoggerServer)) {
        rebind(LoggerFactory).toFactory(ctx =>
            (name: string) => {
                const child = new Container({ defaultScope: 'Singleton' });
                child.parent = ctx.container;
                child.bind(ILogger).to(Logger).inTransientScope();
                child.bind(LoggerName).toConstantValue(name);
                return child.get(ILogger);
            }
        );
    } else {
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
});
