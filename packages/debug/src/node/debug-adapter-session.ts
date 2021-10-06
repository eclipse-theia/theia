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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Some entities copied and modified from https://github.com/Microsoft/vscode-debugadapter-node/blob/master/adapter/src/protocol.ts

import {
    CommunicationProvider,
    DebugAdapterSession
} from './debug-model';
import { DebugProtocol } from 'vscode-debugprotocol';
import { Channel } from '@theia/core/lib/common/messaging';
import { DisposableCollection, Disposable } from '@theia/core/lib/common/disposable';

/**
 * [DebugAdapterSession](#DebugAdapterSession) implementation.
 */
export class DebugAdapterSessionImpl implements DebugAdapterSession {

    private readonly toDispose = new DisposableCollection();
    private channel?: Channel<string>;

    constructor(
        readonly id: string,
        protected readonly communicationProvider: CommunicationProvider
    ) {
        this.toDispose.pushAll([
            this.communicationProvider,
            Disposable.create(() => this.write(JSON.stringify({ seq: -1, type: 'request', command: 'disconnect' }))),
            Disposable.create(() => this.write(JSON.stringify({ seq: -1, type: 'request', command: 'terminate' })))
        ]);

        this.communicationProvider.onMessageReceived((message: string) => this.send(message));
        this.communicationProvider.onClose(() => this.onDebugAdapterExit(1, undefined)); // FIXME pass a proper exit code
        this.communicationProvider.onError(error => this.onDebugAdapterError(error));

    }

    async start(channel: Channel<string>): Promise<void> {
        if (this.channel) {
            throw new Error('The session has already been started, id: ' + this.id);
        }
        this.channel = channel;
        this.channel.onMessage(message => this.write(message));
        this.channel.onClose(() => this.channel = undefined);

    }

    protected onDebugAdapterExit(exitCode: number, signal: string | undefined): void {
        const event: DebugProtocol.ExitedEvent = {
            type: 'event',
            event: 'exited',
            seq: -1,
            body: {
                exitCode
            }
        };
        this.send(JSON.stringify(event));
    }

    protected onDebugAdapterError(error: Error): void {
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
            this.channel.send(message);
        }
    }

    protected write(message: string): void {
        this.communicationProvider.send(message);
    }

    async stop(): Promise<void> {
        this.toDispose.dispose();
    }
}
