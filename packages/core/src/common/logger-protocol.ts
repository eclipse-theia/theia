/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { JsonRpcServer } from './messaging/proxy-factory';

export const ILoggerServer = Symbol('ILoggerServer');

export const loggerPath = '/services/logger';

export interface ILoggerServer extends JsonRpcServer<ILoggerClient> {
    setLogLevel(name: string, logLevel: number): Promise<void>;
    getLogLevel(name: string): Promise<number>;
    log(name: string, logLevel: number, message: string, params: any[]): Promise<void>;
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
