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

import { JsonRpcServer } from './messaging/proxy-factory';

export const ILoggerServer = Symbol('ILoggerServer');

export const loggerPath = '/services/logger';

export interface ILoggerServer extends JsonRpcServer<ILoggerClient> {
    setLogLevel(name: string, logLevel: number): Promise<void>;
    getLogLevel(name: string): Promise<number>;
    log(name: string, logLevel: number, message: any, params: any[]): Promise<void>;
    child(name: string): Promise<void>;
}

export const ILoggerClient = Symbol('ILoggerClient');

export interface ILogLevelChangedEvent {
    loggerName: string;
    newLogLevel: number;
}

export interface ILoggerClient {
    onLogLevelChanged(event: ILogLevelChangedEvent): void;
}
