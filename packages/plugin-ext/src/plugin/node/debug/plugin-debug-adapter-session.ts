// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { DebugAdapterSessionImpl } from '@theia/debug/lib/node/debug-adapter-session';
import * as theia from '@theia/plugin';
import { DebugAdapter } from '@theia/debug/lib/node/debug-model';
import { Channel } from '@theia/core/lib/common/message-rpc/channel';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Server debug adapter session.
 */
export class PluginDebugAdapterSession extends DebugAdapterSessionImpl {
    readonly type: string;
    readonly name: string;
    readonly configuration: theia.DebugConfiguration;

    constructor(
        override readonly debugAdapter: DebugAdapter,
        protected readonly tracker: theia.DebugAdapterTracker,
        protected readonly theiaSession: theia.DebugSession) {

        super(theiaSession.id, debugAdapter);

        this.type = theiaSession.type;
        this.name = theiaSession.name;
        this.configuration = theiaSession.configuration;
    }

    override async start(channel: Channel): Promise<void> {
        if (this.tracker.onWillStartSession) {
            this.tracker.onWillStartSession();
        }
        await super.start(channel);
    }

    override async stop(): Promise<void> {
        if (this.tracker.onWillStopSession) {
            this.tracker.onWillStopSession();
        }
        await super.stop();
    }

    async customRequest(command: string, args?: any): Promise<any> {
        return this.theiaSession.customRequest(command, args);
    }

    protected override onDebugAdapterError(error: Error): void {
        if (this.tracker.onError) {
            this.tracker.onError(error);
        }
        super.onDebugAdapterError(error);
    }

    protected override send(message: string): void {
        try {
            super.send(message);
        } finally {
            if (this.tracker.onDidSendMessage) {
                this.tracker.onDidSendMessage(JSON.parse(message));
            }
        }
    }

    protected override write(message: string): void {
        if (this.tracker.onWillReceiveMessage) {
            this.tracker.onWillReceiveMessage(JSON.parse(message));
        }
        super.write(message);
    }

    protected override onDebugAdapterExit(): void {
        if (this.tracker.onExit) {
            this.tracker.onExit(undefined, undefined);
        }
        super.onDebugAdapterExit();
    }
}
