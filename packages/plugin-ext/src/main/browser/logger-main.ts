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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { interfaces } from '@theia/core/shared/inversify';
import { LoggerMain, LogLevel } from '../../common';
import { ILogger } from '@theia/core';

export class LoggerMainImpl implements LoggerMain {

    constructor(private readonly container: interfaces.Container) {
    }

    $log(level: LogLevel, name: string | undefined, message: string, params: any[]): void {
        let logger: ILogger;
        if (name) {
            logger = this.container.getNamed<ILogger>(ILogger, name);
        } else {
            logger = this.container.get<ILogger>(ILogger);
        }
        switch (level) {
            case LogLevel.Trace:
                logger.trace(message, ...params);
                break;
            case LogLevel.Debug:
                logger.debug(message, ...params);
                break;
            case LogLevel.Info:
                logger.info(message, ...params);
                break;
            case LogLevel.Warn:
                logger.warn(message, ...params);
                break;
            case LogLevel.Error:
                logger.error(message, ...params);
                break;
        }
    }
}
