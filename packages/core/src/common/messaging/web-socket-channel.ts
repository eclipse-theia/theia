// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */

import { WriteBuffer } from '../message-rpc';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '../message-rpc/uint8-array-message-buffer';
import { AbstractChannel } from '../message-rpc/channel';
import { Socket as ClientSocket } from 'socket.io-client';
import { Socket as ServerSocket } from 'socket.io';
import { Emitter } from 'vscode-languageserver-protocol';

export type WebSocket = ClientSocket | ServerSocket;

/**
 * A channel that manages the main websocket connection between frontend and backend. All service channels
 * are reusing this main channel. (multiplexing). An {@link IWebSocket} abstraction is used to keep the implementation
 * independent of the actual websocket implementation and its execution context (backend vs. frontend).
 */
export class WebSocketChannel extends AbstractChannel {
    static wsPath = '/services';

    private onDidConnectEmitter = new Emitter<void>();
    onDidConnect = this.onDidConnectEmitter.event;

    constructor(protected readonly socket: WebSocket) {
        super();
        socket.on('connect', () => {
            this.onDidConnectEmitter.fire();
        });

        socket.on('disconnect', reason => {
            this.onCloseEmitter.fire({
                reason: reason
            });
        });

        socket.on('error', reason => this.onErrorEmitter.fire(reason));
        socket.on('message', data => {
            // In the browser context socketIO receives binary messages as ArrayBuffers.
            // So we have to convert them to a Uint8Array before delegating the message to the read buffer.
            const buffer = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
            this.onMessageEmitter.fire(() => new Uint8ArrayReadBuffer(buffer));
        });
    }

    getWriteBuffer(): WriteBuffer {
        const result = new Uint8ArrayWriteBuffer();

        result.onCommit(buffer => {
            if (this.socket.connected) {
                this.socket.send(buffer);
            }
        });

        return result;
    }

    override close(): void {
        this.socket.disconnect();
        super.close();
    }
}
