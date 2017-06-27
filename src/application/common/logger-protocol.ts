/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

export const ILoggerServer = Symbol('ILoggerServer');

export const loggerPath = '/services/logger';

export interface ILoggerServer {
    setClient(client: ILoggerClient | undefined): void;
    setLogLevel(id: number, logLevel: number): Promise<void>;
    getLogLevel(id: number): Promise<number>;
    log(id: number, logLevel: number, message: string, params: any[]): Promise<void>;
    child(obj: object): Promise<number>;
}

export const ILoggerClient = Symbol('ILoggerClient');

export interface ILogLevelChangedEvent {
    oldLogLevel: number;
    newLogLevel: number;
}

export interface ILoggerClient {
    onLogLevelChanged(event: ILogLevelChangedEvent): void;
}
