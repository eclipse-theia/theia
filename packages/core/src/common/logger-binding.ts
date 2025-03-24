// *****************************************************************************
// Copyright (C) 2025 TypeFox and others.
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

import { interfaces } from 'inversify';
import { ILogger, Logger, LoggerName, rootLoggerName } from './logger';
import { LoggerWatcher } from './logger-watcher';

export function bindCommonLogger(bind: interfaces.Bind): void {
    bind(LoggerName).toConstantValue(rootLoggerName);
    bind(ILogger).to(Logger).inSingletonScope().when(request => getName(request) === undefined);
    bind(ILogger).toDynamicValue(ctx => {
        const logger = ctx.container.get<ILogger>(ILogger);
        return logger.child(getName(ctx.currentRequest)!);
    }).when(request => getName(request) !== undefined);
    bind(LoggerWatcher).toSelf().inSingletonScope();
}

function getName(request: interfaces.Request): string | undefined {
    const named = request.target.metadata.find(e => e.key === 'named');
    return named ? named.value?.toString() : undefined;
}
