/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { IDebugSession, IDebugSessionFactory } from './debug-session';
import { DebugSessionManager } from './debug-session-manager';
import { IDebugServer, IDebugClient } from '../common/debug-protocol';
import { ILogger } from '@theia/core/lib/common';

@injectable()
export class DebugServer implements IDebugServer {

    client: IDebugClient;

    constructor(
        @inject(DebugSessionManager) protected readonly debugSesssionManager: DebugSessionManager,
        @inject(IDebugSessionFactory) protected readonly debugSessionFactory: () => IDebugSession,
        @inject(ILogger) protected readonly logger: ILogger) {

    }

    createSession(): Promise<number> {
        const session = this.debugSessionFactory();
        session.start({});
        return Promise.resolve(session.id);
    }

    /* FIXME make a Session server
    So that we can do requests on a session directly
    */
    getSessionTerminalId(sessionId: number): Promise<number> {
        const session = this.debugSesssionManager.get(sessionId);
        if (session !== undefined) {
            const debugProcess = session.debugger.debugProcess;
            return debugProcess.then(process => process.id);
        } else {
            throw (new Error(`No Session id: ${sessionId}`));
        }
    }

    dispose() {

    }

    setClient(client: IDebugClient) {
        this.client = client;
    }
}
