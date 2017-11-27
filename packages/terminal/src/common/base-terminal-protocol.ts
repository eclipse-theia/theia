/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { JsonRpcServer } from '@theia/core/lib/common/messaging/proxy-factory';

export interface IBaseTerminalServerOptions { }

export interface IBaseTerminalServer extends JsonRpcServer<IBaseTerminalClient> {
    create(IBaseTerminalServerOptions: object): Promise<number>;
    resize(id: number, cols: number, rows: number): Promise<void>;
    attach(id: number): Promise<number>;
    close(id: number): Promise<void>;
}

export interface IBaseTerminalExitEvent {
    terminalId: number;
    code: number;
    signal?: string;
}

export interface IBaseTerminalErrorEvent {
    terminalId: number;
    error: Error
}

export interface IBaseTerminalClient {
    onTerminalExitChanged(event: IBaseTerminalExitEvent): void;
    onTerminalError(event: IBaseTerminalErrorEvent): void;
}
