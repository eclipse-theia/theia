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
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '../message-rpc/uint8-array-message-buffer';
import { AbstractChannel } from '../message-rpc/channel';
import { Disposable } from '../disposable';
import { ProcessTimeRunOnceScheduler } from '../scheduler';

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
    /**
     * Listener callback to handle connect events (Remote side).
     * @param cb The callback.
     */
    onConnect(cb: () => void): void;
}

/**
 * A persistant WebSocket implementation based on the `{@link IWebSocket}.
 * For the client side, it will always try to reconnect to the remote.
 * For the sever side, it will close itself after the `ReconnectionGraceTime` time.
 */
export class PersistentWebSocket implements IWebSocket {

    /**
     * Maximal grace time between the first and the last reconnection...
     */
    static ReconnectionGraceTime: number = 10 * 60 * 1000; // 10 min
    static ReconnectionKey: string = 'persistent_key';

    public underlyingSocketConnected = true;

    private readonly _onCloseEmitter = new Emitter<string>();
    private readonly _onClose: Event<string> = this._onCloseEmitter.event;
    private _onCloseReason: string;
    private readonly _onSocketDisconnect = new Emitter<void>();
    public readonly onSocketDisconnect: Event<void> = this._onSocketDisconnect.event;

    private readonly _onMessageEmitter = new Emitter<Uint8Array>();
    private readonly _onMessage: Event<Uint8Array> = this._onMessageEmitter.event;

    private readonly _onErrorEmitter = new Emitter<any>();
    private readonly _onError: Event<any> = this._onErrorEmitter.event;

    private readonly _onConnectEmitter = new Emitter<void>();
    private readonly _onConnect: Event<void> = this._onConnectEmitter.event;

    private readonly _reconnectionShortGraceTime: number;
    private _disconnectRunner: ProcessTimeRunOnceScheduler;

    private pendingData: Uint8Array[] = [];

    constructor(protected socket: IWebSocket) {
        this._reconnectionShortGraceTime = PersistentWebSocket.ReconnectionGraceTime;
        this._disconnectRunner = new ProcessTimeRunOnceScheduler(() => {
            this.fireClose();
        }, this._reconnectionShortGraceTime);

        socket.onClose(reason => {
            this.handleSocketDisconnect(reason);
        });
        socket.onConnect(() => {
            this.handleReconnect();
        });

        socket.onMessage(message => this._onMessageEmitter.fire(message));
        socket.onError(message => this._onErrorEmitter.fire(message));
    }

    send(message: Uint8Array): void {
        if (this.socket.isConnected()) {
            this.socket.send(message);
        } else {
            this.pendingData.push(message);
        }
    }

    protected handleSocketDisconnect(reason: string): void {
        this.underlyingSocketConnected = false;
        this._onCloseReason = reason;
        // The socket has closed, let's give the renderer a certain amount of time to reconnect
        if (!this._disconnectRunner.isScheduled()) {
            this._disconnectRunner.schedule();
        }
        this._onSocketDisconnect.fire();
    }

    protected handleReconnect(): void {
        this.underlyingSocketConnected = true;
        if (this._disconnectRunner.isScheduled()) {
            this._disconnectRunner.cancel();
        }
        const pending = this.pendingData;
        this.pendingData = [];
        for (const content of pending) {
            this.send(content);
        }
        this._onConnectEmitter.fire();
    }

    close(): void {
        this.socket.close();
    }

    isConnected(): boolean {
        return true;
    }

    onMessage(cb: (message: Uint8Array) => void): void {
        this._onMessage(cb);
    }

    onError(cb: (reason: any) => void): void {
        this._onError(cb);
    }

    onClose(cb: (reason: string, code?: number | undefined) => void): void {
        this._onClose(cb);
    }

    onConnect(cb: () => void): void {
        this._onConnect(cb);
    }

    public fireClose(): void {
        this._onCloseEmitter.fire(this._onCloseReason);
    }

    public acceptReconnection(socket: IWebSocket): void {
        this.socket.close();
        this.socket = socket;
        socket.onClose(reason => this.handleSocketDisconnect(reason));
        socket.onMessage(message => this._onMessageEmitter.fire(message));
        socket.onError(message => this._onErrorEmitter.fire(message));
        this.handleReconnect();
    }
}
