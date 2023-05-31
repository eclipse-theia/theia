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
import { Disposable } from '../disposable';

/**
 * A channel that manages the main websocket connection between frontend and backend. All service channels
 * are reusing this main channel. (multiplexing). An {@link IWebSocket} abstraction is used to keep the implementation
 * independent of the actual websocket implementation and its execution context (backend vs. frontend).
 */
export class WebSocketChannel extends AbstractChannel {
    static wsPath = '/services';

    constructor(protected readonly socket: IWebSocket) {
        super();
        this.toDispose.push(Disposable.create(() => socket.close()));
        socket.onClose((reason, code) => this.onCloseEmitter.fire({ reason, code }));
        socket.onClose(() => this.close());
        socket.onError(error => this.onErrorEmitter.fire(error));
        socket.onMessage(data => this.onMessageEmitter.fire(() => {
            // In the browser context socketIO receives binary messages as ArrayBuffers.
            // So we have to convert them to a Uint8Array before delegating the message to the read buffer.
            const buffer = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
            return new Uint8ArrayReadBuffer(buffer);
        }));
    }

    getWriteBuffer(): WriteBuffer {
        const result = new Uint8ArrayWriteBuffer();

        result.onCommit(buffer => {
            if (this.socket.isConnected()) {
                this.socket.send(buffer);
            }
        });

        return result;
    }
}

/**
 * An abstraction that enables reuse of the `{@link WebSocketChannel} class in the frontend and backend
 * independent of the actual underlying socket implementation.
 */
export interface IWebSocket {
    /**
     * Sends the given message over the web socket in binary format.
     * @param message The binary message.
     */
    send(message: Uint8Array): void;
    /**
     * Closes the websocket from the local side.
     */
    close(): void;
    /**
     * The connection state of the web socket.
     */
    isConnected(): boolean;
    /**
     * Listener callback to handle incoming messages.
     * @param cb The callback.
     */
    onMessage(cb: (message: Uint8Array) => void): void;
    /**
     * Listener callback to handle socket errors.
     * @param cb The callback.
     */
    onError(cb: (reason: any) => void): void;
    /**
     * Listener callback to handle close events (Remote side).
     * @param cb The callback.
     */
    onClose(cb: (reason: string, code?: number) => void): void;
}

