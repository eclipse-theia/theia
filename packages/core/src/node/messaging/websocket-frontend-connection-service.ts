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

import { Channel, WriteBuffer } from '../../common/message-rpc';
import { MessagingService } from './messaging-service';
import { inject, injectable } from 'inversify';
import { Socket } from 'socket.io';
import { ConnectionHandlers } from './default-messaging-service';
import { SocketWriteBuffer } from '../../common/messaging/socket-write-buffer';
import { FrontendConnectionService } from './frontend-connection-service';
import { AbstractChannel } from '../../common/message-rpc/channel';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '../../common/message-rpc/uint8-array-message-buffer';
import { BackendApplicationConfigProvider } from '../backend-application-config-provider';
import { WebsocketEndpoint } from './websocket-endpoint';
import { ConnectionManagementMessages } from '../../common/messaging/connection-management';
import { Disposable, DisposableCollection } from '../../common';

@injectable()
export class WebsocketFrontendConnectionService implements FrontendConnectionService {

    @inject(WebsocketEndpoint)
    protected readonly websocketServer: WebsocketEndpoint;

    protected readonly wsHandlers = new ConnectionHandlers();
    protected readonly connectionsByFrontend = new Map<string, ReconnectableSocketChannel>();
    protected readonly closeTimeouts = new Map<string, NodeJS.Timeout>();
    protected readonly channelsMarkedForClose = new Set<string>();

    registerConnectionHandler(spec: string, callback: (params: MessagingService.PathParams, channel: Channel) => void): void {
        this.websocketServer.registerConnectionHandler(spec, (params, socket) => this.handleConnection(socket, channel => callback(params, channel)));
    }

    protected async handleConnection(socket: Socket, channelCreatedHandler: (channel: Channel) => void): Promise<void> {
        // eslint-disable-next-line prefer-const
        let reconnectListener: (frontEndId: string) => void;
        const initialConnectListener = (frontEndId: string) => {
            socket.off(ConnectionManagementMessages.INITIAL_CONNECT, initialConnectListener);
            socket.off(ConnectionManagementMessages.RECONNECT, reconnectListener);
            if (this.connectionsByFrontend.has(frontEndId)) {
                this.closeConnection(frontEndId, 'reconnecting same front end');
            }
            const channel = this.createConnection(socket, frontEndId);
            this.handleSocketDisconnect(socket, channel, frontEndId);
            channelCreatedHandler(channel);
            socket.emit(ConnectionManagementMessages.INITIAL_CONNECT);
        };

        reconnectListener = (frontEndId: string) => {
            socket.off(ConnectionManagementMessages.INITIAL_CONNECT, initialConnectListener);
            socket.off(ConnectionManagementMessages.RECONNECT, reconnectListener);
            const channel = this.connectionsByFrontend.get(frontEndId);
            if (channel) {
                console.info(`Reconnecting to front end ${frontEndId}`);
                socket.emit(ConnectionManagementMessages.RECONNECT, true);
                channel.connect(socket);
                this.handleSocketDisconnect(socket, channel, frontEndId);
                const pendingTimeout = this.closeTimeouts.get(frontEndId);
                clearTimeout(pendingTimeout);
                this.closeTimeouts.delete(frontEndId);
            } else {
                console.info(`Reconnecting failed for ${frontEndId}`);
                socket.emit(ConnectionManagementMessages.RECONNECT, false);
            }
        };
        socket.on(ConnectionManagementMessages.INITIAL_CONNECT, initialConnectListener);
        socket.on(ConnectionManagementMessages.RECONNECT, reconnectListener);
    }

    protected closeConnection(frontEndId: string, reason: string): void {
        console.info(`closing connection for ${frontEndId}`);
        const connection = this.connectionsByFrontend.get(frontEndId)!; // not called when no connection is present

        this.connectionsByFrontend.delete(frontEndId);

        const pendingTimeout = this.closeTimeouts.get(frontEndId);
        clearTimeout(pendingTimeout);
        this.closeTimeouts.delete(frontEndId);

        connection.onCloseEmitter.fire({ reason });
        connection.close();
    }

    protected createConnection(socket: Socket, frontEndId: string): ReconnectableSocketChannel {
        console.info(`creating connection for ${frontEndId}`);
        const channel = new ReconnectableSocketChannel();
        channel.connect(socket);

        this.connectionsByFrontend.set(frontEndId, channel);
        return channel;
    }

    handleSocketDisconnect(socket: Socket, channel: ReconnectableSocketChannel, frontEndId: string): void {
        socket.on('disconnect', evt => {
            console.info('socked closed');
            channel.disconnect();

            const timeout = this.frontendConnectionTimeout();
            const isMarkedForClose = this.channelsMarkedForClose.delete(frontEndId);
            if (timeout === 0 || isMarkedForClose) {
                this.closeConnection(frontEndId, evt);
            } else if (timeout > 0) {
                console.info(`setting close timeout for id ${frontEndId} to ${timeout}`);
                const handle = setTimeout(() => {
                    this.closeConnection(frontEndId, evt);
                }, timeout);
                this.closeTimeouts.set(frontEndId, handle);
            } else {
                // timeout < 0: never close the back end
            }
        });
    }

    markForClose(channelId: string): void {
        this.channelsMarkedForClose.add(channelId);
    }

    private frontendConnectionTimeout(): number {
        const envValue = Number(process.env['FRONTEND_CONNECTION_TIMEOUT']);
        if (!isNaN(envValue)) {
            return envValue;
        }

        return BackendApplicationConfigProvider.get().frontendConnectionTimeout;
    }
}

class ReconnectableSocketChannel extends AbstractChannel {
    private socket: Socket | undefined;
    private socketBuffer = new SocketWriteBuffer();
    private disposables = new DisposableCollection();

    connect(socket: Socket): void {
        this.disposables = new DisposableCollection();
        this.socket = socket;
        const errorHandler = (err: Error) => {
            this.onErrorEmitter.fire(err);
        };
        this.disposables.push(Disposable.create(() => {
            socket.off('error', errorHandler);
        }));
        socket.on('error', errorHandler);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dataListener = (data: any) => {
            // In the browser context socketIO receives binary messages as ArrayBuffers.
            // So we have to convert them to a Uint8Array before delegating the message to the read buffer.
            const buffer = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
            this.onMessageEmitter.fire(() => new Uint8ArrayReadBuffer(buffer));
        };
        this.disposables.push(Disposable.create(() => {
            socket.off('message', dataListener);
        }));
        socket.on('message', dataListener);
        this.socketBuffer.flush(socket);
    }

    disconnect(): void {
        this.disposables.dispose();
        this.socket = undefined;
    }

    override getWriteBuffer(): WriteBuffer {
        const writeBuffer = new Uint8ArrayWriteBuffer();
        writeBuffer.onCommit(data => {
            if (this.socket?.connected) {
                this.socket.send(data);
            } else {
                this.socketBuffer.buffer(data);
            }
        });
        return writeBuffer;
    }
}

