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

import { injectable, interfaces, decorate, unmanaged } from 'inversify';
import { JsonRpcProxyFactory, JsonRpcProxy, Emitter, Event, Channel } from '../../common';
import { Endpoint } from '../endpoint';
import { AbstractConnectionProvider } from '../../common/messaging/abstract-connection-provider';
import { io, Socket } from 'socket.io-client';
import { IWebSocket, PersistentWebSocket, WebSocketChannel } from '../../common/messaging/web-socket-channel';
import { v4 as uuid } from 'uuid';

decorate(injectable(), JsonRpcProxyFactory);
decorate(unmanaged(), JsonRpcProxyFactory, 0);

export interface WebSocketOptions {
    /**
     * True by default.
     */
    reconnecting?: boolean;
}

@injectable()
export class WebSocketConnectionProvider extends AbstractConnectionProvider<WebSocketOptions> {

    protected readonly onSocketDidOpenEmitter: Emitter<void> = new Emitter();
    get onSocketDidOpen(): Event<void> {
        return this.onSocketDidOpenEmitter.event;
    }

    protected readonly onSocketDidCloseEmitter: Emitter<void> = new Emitter();
    get onSocketDidClose(): Event<void> {
        return this.onSocketDidCloseEmitter.event;
    }

    static override createProxy<T extends object>(container: interfaces.Container, path: string, arg?: object): JsonRpcProxy<T> {
        return container.get(WebSocketConnectionProvider).createProxy<T>(path, arg);
    }

    protected readonly socket: Socket;

    constructor() {
        super();
        const url = this.createWebSocketUrl(WebSocketChannel.wsPath);
        this.socket = this.createWebSocket(url);
        this.socket.on('connect', () => {
            if (this.reconnectChannelOpeners.length > 0) {
                this.reconnectChannelOpeners.forEach(opener => opener());
                this.reconnectChannelOpeners = [];
            }
            this.fireSocketDidOpen();
        });
        this.socket.on('disconnect', () => this.fireSocketDidClose());
        this.socket.on('message', () => this.onIncomingMessageActivityEmitter.fire(undefined));
        this.initializeMultiplexer();
        this.socket.connect();
    }

    protected createMainChannel(): Channel {
        const websocket = new PersistentWebSocket(this.toIWebSocket(this.socket));
        return new WebSocketChannel(websocket);
    }

    protected toIWebSocket(socket: Socket): IWebSocket {
        return {
            close: () => {
                socket.removeAllListeners('disconnect');
                socket.removeAllListeners('error');
                socket.removeAllListeners('message');
            },
            isConnected: () => socket.connected,
            onClose: cb => socket.on('disconnect', reason => cb(reason)),
            onError: cb => socket.on('error', reason => cb(reason)),
            onMessage: cb => socket.on('message', data => cb(data)),
            send: message => socket.emit('message', message),
            onConnect: cb => socket.on('connect', cb),
        };
    }

    /**
     * @param path The handler to reach in the backend.
     */
    protected createWebSocketUrl(path: string): string {
        // Since we are using Socket.io, the path should look like the following:
        // proto://domain.com/{path}
        const url = new Endpoint()
            .getWebSocketUrl()
            .withPath(path)
            // add reconnect key for persistent websocket
            .withQuery(`${PersistentWebSocket.ReconnectionKey}=${uuid()}`)
            .toString();
    }

    /**
     * Creates a web socket for the given url
     */
    protected createWebSocket(url: string): Socket {
        return io(url, {
            path: this.createSocketIoPath(url),
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 10000,
            reconnectionAttempts: Infinity,
            extraHeaders: {
                // Socket.io strips the `origin` header
                // We need to provide our own for validation
                'fix-origin': window.location.origin
            }
        });
    }

    /**
     * Path for Socket.io to make its requests to.
     */
    protected createSocketIoPath(url: string): string | undefined {
        if (location.protocol === Endpoint.PROTO_FILE) {
            return '/socket.io';
        }
        let { pathname } = location;
        if (!pathname.endsWith('/')) {
            pathname += '/';
        }
        return pathname + 'socket.io';
    }

    protected fireSocketDidOpen(): void {
        this.onSocketDidOpenEmitter.fire(undefined);
    }

    protected fireSocketDidClose(): void {
        this.onSocketDidCloseEmitter.fire(undefined);
    }
}

