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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Some entities copied and modified from https://github.com/Microsoft/vscode-debugadapter-node/blob/master/adapter/src/protocol.ts

import {
    DebugAdapter,
    DebugAdapterSession
} from './debug-model';
import { DebugProtocol } from 'vscode-debugprotocol';
import { Channel } from '@theia/core/lib/common/message-rpc/channel';

/**
 * [DebugAdapterSession](#DebugAdapterSession) implementation.
 */
export class DebugAdapterSessionImpl implements DebugAdapterSession {

    private channel: Channel | undefined;
    private isClosed: boolean = false;

    constructor(
        readonly id: string,
        protected readonly debugAdapter: DebugAdapter
    ) {
        this.debugAdapter.onMessageReceived((message: string) => this.send(message));
        this.debugAdapter.onClose(() => this.onDebugAdapterExit());
        this.debugAdapter.onError(error => this.onDebugAdapterError(error));

    }

    async start(channel: Channel): Promise<void> {

        console.debug(`starting debug adapter session '${this.id}'`);
        if (this.channel) {
            throw new Error('The session has already been started, id: ' + this.id);
        }
        this.channel = channel;
        this.channel.onMessage(message => this.write(message().readString()));
        this.channel.onClose(() => this.channel = undefined);

    }

    protected onDebugAdapterExit(): void {
        this.isClosed = true;
        console.debug(`onDebugAdapterExit session: '${this.id}'`);
        if (this.channel) {
            this.channel.close();
            this.channel = undefined;
        }
    }

    protected onDebugAdapterError(error: Error): void {
        console.debug(`error in debug adapter session: '${this.id}': ${JSON.stringify(error)}`);
        const event: DebugProtocol.Event = {
            type: 'event',
            event: 'error',
            seq: -1,
            body: error
        };
        this.send(JSON.stringify(event));
    }

    protected send(message: string): void {
        if (this.channel) {
            this.channel.getWriteBuffer().writeString(message);
        }
    }

    protected write(message: string): void {
        if (!this.isClosed) {
            this.debugAdapter.send(message);
        }
    }

    async stop(): Promise<void> {
        console.debug(`stopping debug adapter session: '${this.id}'`);

        if (!this.isClosed) {
            await this.debugAdapter.stop();
        }
        this.channel?.close();
        this.channel = undefined;
    }
}
