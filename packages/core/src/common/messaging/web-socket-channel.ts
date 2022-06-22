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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */

import { AbstractChannel } from './channel';
import { BinaryMessageCodec, MessageCodec } from './message-codec';

export const wsServicePath = '/services';

/**
 * A channel that manages the main websocket connection between frontend and backend. All service channels
 * are reusing this main channel. (multiplexing). An {@link IWebSocket} abstraction is used to keep the implementation
 * independent of the actual websocket implementation and its execution context (backend vs. frontend).
 * For efficient transportation messages are binary encoded with the {@link BinaryMessageCodec}.
 */
export class WebSocketChannel<T = any> extends AbstractChannel<T> {

    constructor(protected readonly socket: IWebSocket, protected messageCodec: MessageCodec<any, Uint8Array> = new BinaryMessageCodec()) {
        super();
        this.toDispose.pushAll([this.onCloseEmitter, this.onMessageEmitter, this.onErrorEmitter]);
        socket.onClose((reason, code) => this.onCloseEmitter.fire({ reason, code }));
        socket.onClose(() => this.close());
        socket.onError(error => this.onErrorEmitter.fire(error));
        // eslint-disable-next-line arrow-body-style
        socket.onMessage(message => this.handleMessage(message));
    }

    protected handleMessage(message: any): void {
        const decoded = this.messageCodec.decode(message) ?? message;
        this.onMessageEmitter.fire(decoded);
    }

    send(message: T): void {
        if (this.socket.isConnected()) {
            const encoded = this.messageCodec.encode(message) ?? message;
            this.socket.send(encoded);
        }
    }

    override close(): void {
        super.close();
        this.socket.close();
    }
}

/**
 * An abstraction that enables reuse of the `{@link WebSocketChannel} class in the frontend and backend
 * independent of the actual underlying socket implementation.
 */
export interface IWebSocket {
    /**
     * Sends the given message over the web socket.
     * @param message The binary message.
     */
    send(message: any): void;
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
    onMessage(cb: (UInt8: any) => void): void;
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

