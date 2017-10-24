/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { LogLevel } from './logger';
import { ILoggerServer, ILoggerClient } from './logger-protocol';

@injectable()
export class ConsoleLoggerServer implements ILoggerServer {

    setLogLevel(id: number, logLevel: number): Promise<void> {
        return Promise.resolve();
    }
    getLogLevel(id: number): Promise<number> {
        return Promise.resolve(LogLevel.DEBUG);
    }
    log(id: number, logLevel: number, message: string, params: any[]): Promise<void> {
        console.log(`${message} ${params.map(p => p.toString()).join(' ')}`);
        return Promise.resolve();
    }
    child(obj: object): Promise<number> {
        return Promise.resolve(1);
    }
    dispose(): void {
    }
    setClient(client: ILoggerClient | undefined): void {
    }

}
