/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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
/* eslint-disable @typescript-eslint/no-explicit-any */

import ReconnectingWebSocket from 'reconnecting-websocket';
import { v4 as uuid } from 'uuid';
import { Channel } from './channel';
import { ReadBuffer, WriteBuffer } from './message-buffer';
import { ArrayBufferReadBuffer, ArrrayBufferWriteBuffer } from './array-buffer-message-buffer';
import { Deferred } from '../promise-util';
import { Emitter, Event } from '../event';
import { Endpoint } from 'src/browser';

/**
 * An attempt at a channel implementation over a websocket with fallback to http.
 */

export interface WebSocketOptions {
    /**
     * True by default.
     */
    reconnecting?: boolean;
}

export const HttpFallbackOptions = Symbol('HttpFallbackOptions');

export interface HttpFallbackOptions {
    /** Determines whether Theia is allowed to use the http fallback. True by default. */
    allowed: boolean;
    /** Number of failed websocket connection attempts before the fallback is triggered. 2 by default. */
    maxAttempts: number;
    /** The maximum duration (in ms) after which the http request should timeout. 5000 by default. */
    pollingTimeout: number;
    /** The timeout duration (in ms) after a request was answered with an error code. 5000 by default. */
    errorTimeout: number;
    /** The minimum timeout duration (in ms) between two http requests. 0 by default. */
    requestTimeout: number;
}

export const DEFAULT_HTTP_FALLBACK_OPTIONS: HttpFallbackOptions = {
    allowed: true,
    maxAttempts: 2,
    errorTimeout: 5000,
    pollingTimeout: 5000,
    requestTimeout: 0
};

export class WebSocketClientChannel implements Channel {

    protected readonly readyDeferred: Deferred<void> = new Deferred();

    protected readonly onCloseEmitter: Emitter<void> = new Emitter();
    get onClose(): Event<void> {
        return this.onCloseEmitter.event;
    }

    protected readonly onMessageEmitter: Emitter<ReadBuffer> = new Emitter();
    get onMessage(): Event<ReadBuffer> {
        return this.onMessageEmitter.event;
    }

    protected readonly onErrorEmitter: Emitter<any> = new Emitter();
    get onError(): Event<any> {
        return this.onErrorEmitter.event;
    }

    protected readonly socket: ReconnectingWebSocket;
    protected useHttpFallback = false;
    protected websocketErrorCounter = 0;
    protected httpFallbackId = uuid();
    protected httpFallbackDisconnected = true;

    constructor(protected readonly httpFallbackOptions: HttpFallbackOptions | undefined) {
        const url = this.createWebSocketUrl('/services');
        const socket = this.createWebSocket(url);
        socket.onerror = event => this.handleSocketError(event);
        socket.onopen = () => {
            this.fireSocketDidOpen();
        };
        socket.onclose = ({ code, reason }) => {
            this.onCloseEmitter.fire();
        };
        socket.onmessage = ({ data }) => {
            this.onMessageEmitter.fire(new ArrayBufferReadBuffer(data));
        };
        this.socket = socket;
        window.addEventListener('offline', () => this.tryReconnect());
        window.addEventListener('online', () => this.tryReconnect());
    }

    getWriteBuffer(): WriteBuffer {
        const result = new ArrrayBufferWriteBuffer();
        const httpUrl = this.createHttpWebSocketUrl('/services');
        if (this.useHttpFallback) {
            result.writeString(this.httpFallbackId);
            result.writeString('true');
            result.onCommit(buffer => {
                fetch(httpUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/octet-stream'
                    },
                    body: buffer
                });
            });

        } else if (this.socket.readyState < WebSocket.CLOSING) {
            result.onCommit(buffer => {
                this.socket.send(buffer);
            });
        }
        return result;

    }

    close(): void {
        this.socket.close();
    }

    get ready(): Promise<void> {
        return this.readyDeferred.promise;
    }

    handleSocketError(event: unknown): void {
        this.websocketErrorCounter += 1;
        if (this.httpFallbackOptions?.allowed && this.websocketErrorCounter >= this.httpFallbackOptions?.maxAttempts) {
            this.useHttpFallback = true;
            this.socket.close();
            const httpUrl = this.createHttpWebSocketUrl('/services');
            this.readyDeferred.resolve();
            this.doLongPolling(httpUrl);
            console.warn(
                'Could not establish a websocket connection. The application will be using the HTTP fallback mode. This may affect performance and the behavior of some features.'
            );
        }
        this.onErrorEmitter.fire(event);
        console.error(event);
    }

    async doLongPolling(url: string): Promise<void> {
        let timeoutDuration = this.httpFallbackOptions?.requestTimeout || 0;
        const controller = new AbortController();
        const pollingId = window.setTimeout(() => controller.abort(), this.httpFallbackOptions?.pollingTimeout);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                signal: controller.signal,
                keepalive: true,
                body: JSON.stringify({ id: this.httpFallbackId, polling: true })
            });
            if (response.status === 200) {
                window.clearTimeout(pollingId);
                if (this.httpFallbackDisconnected) {
                    this.fireSocketDidOpen();
                }
                const bytes = await response.arrayBuffer();
                this.onMessageEmitter.fire(new ArrayBufferReadBuffer(bytes));
            } else {
                timeoutDuration = this.httpFallbackOptions?.errorTimeout || 0;
                this.httpFallbackDisconnected = true;
                this.onCloseEmitter.fire();
                throw new Error('Response has error code: ' + response.status);
            }
        } catch (e) {
            console.error('Error occurred during long polling', e);
        }
        setTimeout(() => this.doLongPolling(url), timeoutDuration);
    }

    /**
     * Creates a websocket URL to the current location
     */
    protected createWebSocketUrl(path: string): string {
        const endpoint = new Endpoint({ path });
        return endpoint.getWebSocketUrl().toString();
    }

    protected createHttpWebSocketUrl(path: string): string {
        const endpoint = new Endpoint({ path });
        return endpoint.getRestUrl().toString();
    }

    /**
     * Creates a web socket for the given url
     */
    protected createWebSocket(url: string): ReconnectingWebSocket {
        const socket = new ReconnectingWebSocket(url, undefined, {
            maxReconnectionDelay: 10000,
            minReconnectionDelay: 1000,
            reconnectionDelayGrowFactor: 1.3,
            connectionTimeout: 10000,
            maxRetries: Infinity,
            debug: false
        });
        socket.binaryType = 'arraybuffer';
        return socket;
    }

    protected fireSocketDidOpen(): void {
        // Once a websocket connection has opened, disable the http fallback
        if (this.httpFallbackOptions?.allowed) {
            this.httpFallbackOptions.allowed = false;
        }
        this.readyDeferred.resolve();
    }

    protected tryReconnect(): void {
        if (!this.useHttpFallback && this.socket.readyState !== WebSocket.CONNECTING) {
            this.socket.reconnect();
        }
    }

}
