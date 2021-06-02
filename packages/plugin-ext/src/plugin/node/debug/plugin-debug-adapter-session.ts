/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { CommunicationProvider } from '@theia/debug/lib/common/debug-model';
import { DebugAdapterSessionImpl } from '@theia/debug/lib/node/debug-adapter-session';
import * as theia from '@theia/plugin';
import { IWebSocket } from '@theia/core/shared/vscode-ws-jsonrpc';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Server debug adapter session.
 */
export class PluginDebugAdapterSession extends DebugAdapterSessionImpl implements theia.DebugSession {
    readonly type: string;
    readonly name: string;
    readonly configuration: theia.DebugConfiguration;

    constructor(
        protected readonly communicationProvider: CommunicationProvider,
        protected readonly tracker: theia.DebugAdapterTracker,
        protected readonly theiaSession: theia.DebugSession) {

        super(theiaSession.id, communicationProvider);

        this.type = theiaSession.type;
        this.name = theiaSession.name;
        this.configuration = theiaSession.configuration;
    }

    async start(channel: IWebSocket): Promise<void> {
        if (this.tracker.onWillStartSession) {
            this.tracker.onWillStartSession();
        }
        await super.start(channel);
    }

    async stop(): Promise<void> {
        if (this.tracker.onWillStopSession) {
            this.tracker.onWillStopSession();
        }
        await super.stop();
    }

    async customRequest(command: string, args?: any): Promise<any> {
        return this.theiaSession.customRequest(command, args);
    }

    protected onDebugAdapterError(error: Error): void {
        if (this.tracker.onError) {
            this.tracker.onError(error);
        }
        super.onDebugAdapterError(error);
    }

    protected send(message: string): void {
        try {
            super.send(message);
        } finally {
            if (this.tracker.onDidSendMessage) {
                this.tracker.onDidSendMessage(JSON.parse(message));
            }
        }
    }

    protected write(message: string): void {
        if (this.tracker.onWillReceiveMessage) {
            this.tracker.onWillReceiveMessage(JSON.parse(message));
        }
        super.write(message);
    }

    protected onDebugAdapterExit(exitCode: number, signal: string | undefined): void {
        if (this.tracker.onExit) {
            this.tracker.onExit(exitCode, signal);
        }
        super.onDebugAdapterExit(exitCode, signal);
    }
}
