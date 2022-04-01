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

import { Emitter, Event } from '../event';
import { WriteBuffer } from '../message-rpc';
import { ArrayBufferReadBuffer, ArrayBufferWriteBuffer } from '../message-rpc/array-buffer-message-buffer';
import { Channel, ForwardingChannel, ReadBufferFactory } from '../message-rpc/channel';

/**
 * The messaging connection between a choesive frontend and backend service.
 */
export type WebSocketChannel = ForwardingChannel;

export namespace WebSocketChannel {
    export const wsPath = '/services';
}
export interface IWebSocket {
    send(message: ArrayBuffer): void;
    close(): void;
    isConnected(): boolean;
    onMessage(cb: (message: ArrayBuffer) => void): void;
    onError(cb: (reason: any) => void): void;
    onClose(cb: () => void): void;
}

export class WebSocketMainChannel implements Channel {
    protected readonly onCloseEmitter: Emitter<void> = new Emitter();
    get onClose(): Event<void> {
        return this.onCloseEmitter.event;
    }

    protected readonly onMessageEmitter: Emitter<ReadBufferFactory> = new Emitter();
    get onMessage(): Event<ReadBufferFactory> {
        return this.onMessageEmitter.event;
    }

    protected readonly onErrorEmitter: Emitter<unknown> = new Emitter();
    get onError(): Event<unknown> {
        return this.onErrorEmitter.event;
    }

    readonly id: string;

    constructor(protected readonly socket: IWebSocket) {
        socket.onClose(() => this.onCloseEmitter.fire());
        socket.onError(error => this.onErrorEmitter.fire(error));
        socket.onMessage(buffer => this.onMessageEmitter.fire(() => new ArrayBufferReadBuffer(buffer)));

        this.id = 'main_channel';
    }

    getWriteBuffer(): WriteBuffer {
        const result = new ArrayBufferWriteBuffer();
        if (this.socket.isConnected()) {
            result.onCommit(buffer => {
                this.socket.send(buffer);
            });
        }
        return result;
    }

    close(): void {
        this.socket.close();
    }

}
