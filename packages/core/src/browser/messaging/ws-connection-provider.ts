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
import { createWebSocketConnection, Logger, ConsoleLogger } from 'vscode-ws-jsonrpc/lib';
import { ConnectionHandler, JsonRpcProxyFactory, JsonRpcProxy, Emitter, Event } from '../../common';
import { WebSocketChannel } from '../../common/messaging/web-socket-channel';
import { Endpoint } from '../endpoint';
const ReconnectingWebSocket = require('reconnecting-websocket');

decorate(injectable(), JsonRpcProxyFactory);
decorate(unmanaged(), JsonRpcProxyFactory, 0);

export interface WebSocketOptions {
    /**
     * True by default.
     */
    reconnecting?: boolean;
}

@injectable()
export class WebSocketConnectionProvider {

    /**
     * Create a proxy object to remote interface of T type
     * over a web socket connection for the given path and proxy factory.
     */
    static createProxy<T extends object>(container: interfaces.Container, path: string, factory: JsonRpcProxyFactory<T>): JsonRpcProxy<T>;
    /**
     * Create a proxy object to remote interface of T type
     * over a web socket connection for the given path.
     *
     * An optional target can be provided to handle
     * notifications and requests from a remote side.
     */
    static createProxy<T extends object>(container: interfaces.Container, path: string, target?: object): JsonRpcProxy<T>;
    static createProxy<T extends object>(container: interfaces.Container, path: string, arg?: object): JsonRpcProxy<T> {
        return container.get(WebSocketConnectionProvider).createProxy<T>(path, arg);
    }

    protected channelIdSeq = 0;
    protected readonly socket: WebSocket;
    protected readonly channels = new Map<number, WebSocketChannel>();

    protected readonly onIncomingMessageActivityEmitter: Emitter<void> = new Emitter();
    public onIncomingMessageActivity: Event<void> = this.onIncomingMessageActivityEmitter.event;

    constructor() {
        const url = this.createWebSocketUrl(WebSocketChannel.wsPath);
        const socket = this.createWebSocket(url);
        socket.onerror = console.error;
        socket.onclose = ({ code, reason }) => {
            for (const channel of [...this.channels.values()]) {
                channel.close(code, reason);
            }
        };
        socket.onmessage = ({ data }) => {
            const message: WebSocketChannel.Message = JSON.parse(data);
            const channel = this.channels.get(message.id);
            if (channel) {
                channel.handleMessage(message);
            } else {
                console.error('The ws channel does not exist', message.id);
            }
            this.onIncomingMessageActivityEmitter.fire(undefined);
        };
        this.socket = socket;
    }

    /**
     * Create a proxy object to remote interface of T type
     * over a web socket connection for the given path and proxy factory.
     */
    createProxy<T extends object>(path: string, factory: JsonRpcProxyFactory<T>): JsonRpcProxy<T>;
    /**
     * Create a proxy object to remote interface of T type
     * over a web socket connection for the given path.
     *
     * An optional target can be provided to handle
     * notifications and requests from a remote side.
     */
    createProxy<T extends object>(path: string, target?: object): JsonRpcProxy<T>;
    createProxy<T extends object>(path: string, arg?: object): JsonRpcProxy<T> {
        const factory = arg instanceof JsonRpcProxyFactory ? arg : new JsonRpcProxyFactory<T>(arg);
        this.listen({
            path,
            onConnection: c => factory.listen(c)
        });
        return factory.createProxy();
    }

    /**
     * Install a connection handler for the given path.
     */
    listen(handler: ConnectionHandler, options?: WebSocketOptions): void {
        this.openChannel(handler.path, channel => {
            const connection = createWebSocketConnection(channel, this.createLogger());
            connection.onDispose(() => channel.close());
            handler.onConnection(connection);
        }, options);
    }

    openChannel(path: string, handler: (channel: WebSocketChannel) => void, options?: WebSocketOptions): void {
        if (this.socket.readyState === WebSocket.OPEN) {
            this.doOpenChannel(path, handler, options);
        } else {
            const openChannel = () => {
                this.socket.removeEventListener('open', openChannel);
                this.openChannel(path, handler, options);
            };
            this.socket.addEventListener('open', openChannel);
        }
    }

    protected doOpenChannel(path: string, handler: (channel: WebSocketChannel) => void, options?: WebSocketOptions): void {
        const id = this.channelIdSeq++;
        const channel = this.createChannel(id);
        this.channels.set(id, channel);
        channel.onClose(() => {
            if (this.channels.delete(channel.id)) {
                const { reconnecting } = { reconnecting: true, ...options };
                if (reconnecting) {
                    this.openChannel(path, handler, options);
                }
            } else {
                console.error('The ws channel does not exist', channel.id);
            }
        });
        channel.onOpen(() => handler(channel));
        channel.open(path);
    }

    protected createChannel(id: number): WebSocketChannel {
        return new WebSocketChannel(id, content => {
            if (this.socket.readyState < WebSocket.CLOSING) {
                this.socket.send(content);
            }
        });
    }

    protected createLogger(): Logger {
        return new ConsoleLogger();
    }

    /**
     * Creates a websocket URL to the current location
     */
    protected createWebSocketUrl(path: string): string {
        const endpoint = new Endpoint({ path });
        return endpoint.getWebSocketUrl().toString();
    }

    /**
     * Creates a web socket for the given url
     */
    protected createWebSocket(url: string): WebSocket {
        return new ReconnectingWebSocket(url, undefined, {
            maxReconnectionDelay: 10000,
            minReconnectionDelay: 1000,
            reconnectionDelayGrowFactor: 1.3,
            connectionTimeout: 10000,
            maxRetries: Infinity,
            debug: false
        });
    }

}
