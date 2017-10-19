/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { JsonRpcServer } from '@theia/core/lib/common/messaging/proxy-factory';

export const IDebugServer = Symbol('IDebugServer');

export const debugPath = '/services/debug';

export interface IDebugServer extends JsonRpcServer<IDebugClient> {
    createSession(): Promise<number>;
    getSessionTerminalId(sessionId: number): Promise<number>;
}

export interface IDebugServerOptions {
}

export interface IDebugClient {
}
