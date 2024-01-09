// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
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

import { AbstractChannel, Channel, Disposable, DisposableCollection, Emitter, Event, servicesPath } from '../../common';
import { ConnectionSource } from './connection-source';
import { Socket, io } from 'socket.io-client';
import { Endpoint } from '../endpoint';
import { ForwardingChannel } from '../../common/message-rpc/channel';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '../../common/message-rpc/uint8-array-message-buffer';
import { inject, injectable, postConstruct } from 'inversify';
import { FrontendIdProvider } from './frontend-id-provider';
import { FrontendApplicationConfigProvider } from '../frontend-application-config-provider';
import { SocketWriteBuffer } from '../../common/messaging/socket-write-buffer';
import { ConnectionManagementMessages } from '../../common/messaging/connection-management';

@injectable()
export class WebSocketConnectionSource implements ConnectionSource {
    static readonly NO_CONNECTION = '<none>';

    @inject(FrontendIdProvider)
    protected readonly frontendIdProvider: FrontendIdProvider;

    private readonly writeBuffer = new SocketWriteBuffer();

    private _socket: Socket;
    get socket(): Socket {
        return this._socket;
    }

    protected currentChannel: AbstractChannel;

    protected readonly onConnectionDidOpenEmitter: Emitter<Channel> = new Emitter();
    get onConnectionDidOpen(): Event<Channel> {
        return this.onConnectionDidOpenEmitter.event;
    }

    protected readonly onSocketDidOpenEmitter: Emitter<void> = new Emitter();
    get onSocketDidOpen(): Event<void> {
        return this.onSocketDidOpenEmitter.event;
    }

    protected readonly onSocketDidCloseEmitter: Emitter<void> = new Emitter();
    get onSocketDidClose(): Event<void> {
        return this.onSocketDidCloseEmitter.event;
    }

    protected readonly onIncomingMessageActivityEmitter: Emitter<void> = new Emitter();
    get onIncomingMessageActivity(): Event<void> {
        return this.onIncomingMessageActivityEmitter.event;
    }

    constructor() {
    }

    @postConstruct()
    openSocket(): void {
        const url = this.createWebSocketUrl(servicesPath);
        this._socket = this.createWebSocket(url);

        this._socket.on('connect', () => {
            this.onSocketDidOpenEmitter.fire();
            this.handleSocketConnected();
        });

        this._socket.on('disconnect', () => {
            this.onSocketDidCloseEmitter.fire();
        });

        this._socket.on('error', reason => {
            if (this.currentChannel) {
                this.currentChannel.onErrorEmitter.fire(reason);
            };
        });
        this._socket.connect();
    }

    protected negogiateReconnect(): void {
        const reconnectListener = (hasConnection: boolean) => {
            this._socket.off(ConnectionManagementMessages.RECONNECT, reconnectListener);
            if (hasConnection) {
                console.info(`reconnect succeeded on ${this.socket.id}`);
                this.writeBuffer!.flush(this.socket);
            } else {
                if (FrontendApplicationConfigProvider.get().reloadOnReconnect) {
                    window.location.reload(); // this might happen in the preload module, when we have no window service yet
                } else {
                    console.info(`reconnect failed on ${this.socket.id}`);
                    this.currentChannel.onCloseEmitter.fire({ reason: 'reconnecting channel' });
                    this.currentChannel.close();
                    this.writeBuffer.drain();
                    this.socket.disconnect();
                    this.socket.connect();
                    this.negotiateInitialConnect();
                }
            }
        };
        this._socket.on(ConnectionManagementMessages.RECONNECT, reconnectListener);
        console.info(`sending reconnect on ${this.socket.id}`);
        this._socket.emit(ConnectionManagementMessages.RECONNECT, this.frontendIdProvider.getId());
    }

    protected negotiateInitialConnect(): void {
        const initialConnectListener = () => {
            console.info(`initial connect received on ${this.socket.id}`);

            this._socket.off(ConnectionManagementMessages.INITIAL_CONNECT, initialConnectListener);
            this.connectNewChannel();
        };
        this._socket.on(ConnectionManagementMessages.INITIAL_CONNECT, initialConnectListener);
        console.info(`sending initial connect on ${this.socket.id}`);

        this._socket.emit(ConnectionManagementMessages.INITIAL_CONNECT, this.frontendIdProvider.getId());
    }

    protected handleSocketConnected(): void {
        if (this.currentChannel) {
            this.negogiateReconnect();
        } else {
            this.negotiateInitialConnect();
        }
    }

    connectNewChannel(): void {
        if (this.currentChannel) {
            this.currentChannel.close();
            this.currentChannel.onCloseEmitter.fire({ reason: 'reconnecting channel' });
        }
        this.writeBuffer.drain();
        this.currentChannel = this.createChannel();
        this.onConnectionDidOpenEmitter.fire(this.currentChannel);
    }

    protected createChannel(): AbstractChannel {
        const toDispose = new DisposableCollection();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const messageHandler = (data: any) => {
            this.onIncomingMessageActivityEmitter.fire();
            if (this.currentChannel) {
                // In the browser context socketIO receives binary messages as ArrayBuffers.
                // So we have to convert them to a Uint8Array before delegating the message to the read buffer.
                const buffer = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
                this.currentChannel.onMessageEmitter.fire(() => new Uint8ArrayReadBuffer(buffer));
            };
        };
        this._socket.on('message', messageHandler);
        toDispose.push(Disposable.create(() => {
            this.socket.off('message', messageHandler);
        }));

        const channel = new ForwardingChannel('any', () => {
            toDispose.dispose();
        }, () => {
            const result = new Uint8ArrayWriteBuffer();

            result.onCommit(buffer => {
                if (this.socket.connected) {
                    this.socket.send(buffer);
                } else {
                    this.writeBuffer.buffer(buffer);
                }
            });

            return result;
        });
        return channel;
    }

    /**
     * @param path The handler to reach in the backend.
     */
    protected createWebSocketUrl(path: string): string {
        // Since we are using Socket.io, the path should look like the following:
        // proto://domain.com/{path}
        return this.createEndpoint(path).getWebSocketUrl().withPath(path).toString();
    }

    protected createHttpWebSocketUrl(path: string): string {
        return this.createEndpoint(path).getRestUrl().toString();
    }

    protected createEndpoint(path: string): Endpoint {
        return new Endpoint({ path });
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
}
