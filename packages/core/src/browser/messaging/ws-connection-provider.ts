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

import { decorate, injectable, interfaces, unmanaged } from 'inversify';
import { io, Socket } from 'socket.io-client';
import { Emitter, Event, JsonRpcProxy, JsonRpcProxyFactory } from '../../common';
import { Channel } from '../../common/message-rpc/channel';
import { AbstractConnectionProvider } from '../../common/messaging/abstract-connection-provider';
import { IWebSocket, WebSocketChannel } from '../../common/messaging/web-socket-channel';
import { Endpoint } from '../endpoint';

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
    // Socket that is used by the main channel
    protected socket: Socket;
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

    protected createMainChannel(): Channel {
        const url = this.createWebSocketUrl(WebSocketChannel.wsPath);
        const socket = this.createWebSocket(url);
        const channel = new WebSocketChannel(toIWebSocket(socket));
        socket.on('connect', () => {
            this.fireSocketDidOpen();
        });
        channel.onClose(() => this.fireSocketDidClose());
        socket.connect();
        this.socket = socket;

        return channel;
    }

    override async openChannel(path: string, handler: (channel: Channel) => void, options?: WebSocketOptions): Promise<void> {
        if (this.socket.connected) {
            return super.openChannel(path, handler, options);
        } else {
            const openChannel = () => {
                this.socket.off('connect', openChannel);
                this.openChannel(path, handler, options);
            };
            this.socket.on('connect', openChannel);
        }
    }

    /**
     * @param path The handler to reach in the backend.
     */
    protected createWebSocketUrl(path: string): string {
        // Since we are using Socket.io, the path should look like the following:
        // proto://domain.com/{path}
        return new Endpoint().getWebSocketUrl().withPath(path).toString();
    }

    protected createHttpWebSocketUrl(path: string): string {
        return new Endpoint({ path }).getRestUrl().toString();
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

function toIWebSocket(socket: Socket): IWebSocket {
    return {
        close: () => {
            socket.removeAllListeners('disconnect');
            socket.removeAllListeners('error');
            socket.removeAllListeners('message');
            socket.close();
        },
        isConnected: () => socket.connected,
        onClose: cb => socket.on('disconnect', reason => cb(reason)),
        onError: cb => socket.on('error', reason => cb(reason)),
        onMessage: cb => socket.on('message', data => cb(data)),
        send: message => socket.emit('message', message)
    };
}

