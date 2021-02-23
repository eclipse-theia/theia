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
    DebugAdapterSession,
} from '../common/debug-model';
import { DebugProtocol } from 'vscode-debugprotocol';
import { IWebSocket } from '@theia/core/shared/vscode-ws-jsonrpc';
import { DisposableCollection, Disposable } from '@theia/core/lib/common/disposable';

/**
 * [DebugAdapterSession](#DebugAdapterSession) implementation.
 */
export class DebugAdapterSessionImpl implements DebugAdapterSession {

    private static TWO_CRLF = '\r\n\r\n';
    private static CONTENT_LENGTH = 'Content-Length';

    private readonly toDispose = new DisposableCollection();
    private channel: IWebSocket | undefined;
    private contentLength: number;
    private buffer: Buffer;

    constructor(
        readonly id: string,
        protected readonly communicationProvider: CommunicationProvider
    ) {
        this.contentLength = -1;
        this.buffer = Buffer.alloc(0);
        this.toDispose.pushAll([
            this.communicationProvider,
            Disposable.create(() => this.write(JSON.stringify({ seq: -1, type: 'request', command: 'disconnect' }))),
            Disposable.create(() => this.write(JSON.stringify({ seq: -1, type: 'request', command: 'terminate' })))
        ]);
    }

    async start(channel: IWebSocket): Promise<void> {
        if (this.channel) {
            throw new Error('The session has already been started, id: ' + this.id);
        }
        this.channel = channel;
        this.channel.onMessage((message: string) => this.write(message));
        this.channel.onClose(() => this.channel = undefined);

        this.communicationProvider.output.on('data', (data: Buffer) => this.handleData(data));
        this.communicationProvider.output.on('close', () => this.onDebugAdapterExit(1, undefined)); // FIXME pass a proper exit code
        this.communicationProvider.output.on('error', error => this.onDebugAdapterError(error));
        this.communicationProvider.input.on('error', error => this.onDebugAdapterError(error));
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

    protected handleData(data: Buffer): void {
        this.buffer = Buffer.concat([this.buffer, data]);

        while (true) {
            if (this.contentLength >= 0) {
                if (this.buffer.length >= this.contentLength) {
                    const message = this.buffer.toString('utf8', 0, this.contentLength);
                    this.buffer = this.buffer.slice(this.contentLength);
                    this.contentLength = -1;

                    if (message.length > 0) {
                        this.send(message);
                    }
                    continue; // there may be more complete messages to process
                }
            } else {
                let idx = this.buffer.indexOf(DebugAdapterSessionImpl.CONTENT_LENGTH);
                if (idx > 0) {
                    // log unrecognized output
                    const output = this.buffer.slice(0, idx);
                    console.log(output.toString('utf-8'));

                    this.buffer = this.buffer.slice(idx);
                }

                idx = this.buffer.indexOf(DebugAdapterSessionImpl.TWO_CRLF);
                if (idx !== -1) {
                    const header = this.buffer.toString('utf8', 0, idx);
                    const lines = header.split('\r\n');
                    for (let i = 0; i < lines.length; i++) {
                        const pair = lines[i].split(/: +/);
                        if (pair[0] === DebugAdapterSessionImpl.CONTENT_LENGTH) {
                            this.contentLength = +pair[1];
                        }
                    }
                    this.buffer = this.buffer.slice(idx + DebugAdapterSessionImpl.TWO_CRLF.length);
                    continue;
                }
            }
            break;
        }
    }

    protected send(message: string): void {
        if (this.channel) {
            this.channel.send(message);
        }
    }

    protected write(message: string): void {
        this.communicationProvider.input.write(`Content-Length: ${Buffer.byteLength(message, 'utf8')}\r\n\r\n${message}`, 'utf8');
    }

    async stop(): Promise<void> {
        this.toDispose.dispose();
    }
}
