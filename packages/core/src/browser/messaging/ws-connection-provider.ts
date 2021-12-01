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

import { injectable, interfaces, decorate, unmanaged } from 'inversify';
import { JsonRpcProxyFactory, JsonRpcProxy, Emitter, Event } from '../../common';
import { WebSocketChannel } from '../../common/messaging/web-socket-channel';
import { Endpoint } from '../endpoint';
import { AbstractConnectionProvider } from '../../common/messaging/abstract-connection-provider';
import { io, Socket } from 'socket.io-client';

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

    static createProxy<T extends object>(container: interfaces.Container, path: string, arg?: object): JsonRpcProxy<T> {
        return container.get(WebSocketConnectionProvider).createProxy<T>(path, arg);
    }

    protected readonly socket: Socket;

    constructor() {
        super();
        const url = this.createWebSocketUrl(WebSocketChannel.wsPath);
        const socket = this.createWebSocket(url);
        socket.on('connect', () => {
            this.fireSocketDidOpen();
        });
        socket.on('disconnect', reason => {
            for (const channel of [...this.channels.values()]) {
                channel.close(undefined, reason);
            }
            this.fireSocketDidClose();
        });
        socket.on('message', data => {
            this.handleIncomingRawMessage(data);
        });
        socket.connect();
        this.socket = socket;
    }

    openChannel(path: string, handler: (channel: WebSocketChannel) => void, options?: WebSocketOptions): void {
        if (this.socket.connected) {
            super.openChannel(path, handler, options);
        } else {
            const openChannel = () => {
                this.socket.off('connect', openChannel);
                this.openChannel(path, handler, options);
            };
            this.socket.on('connect', openChannel);
        }
    }

    protected createChannel(id: number): WebSocketChannel {
        return new WebSocketChannel(id, content => {
            if (this.socket.connected) {
                this.socket.send(content);
            }
        });
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
    protected createWebSocket(url: string): Socket {
        return io(url, {
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

    protected fireSocketDidOpen(): void {
        this.onSocketDidOpenEmitter.fire(undefined);
    }

    protected fireSocketDidClose(): void {
        this.onSocketDidCloseEmitter.fire(undefined);
    }
}
