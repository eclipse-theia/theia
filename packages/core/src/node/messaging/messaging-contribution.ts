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

import * as http from 'http';
import * as https from 'https';
import { Server, Socket } from 'socket.io';
import { injectable, inject, named, postConstruct, interfaces, Container } from 'inversify';
import { MessageConnection } from 'vscode-ws-jsonrpc';
import { createWebSocketConnection } from 'vscode-ws-jsonrpc/lib/socket/connection';
import { IConnection } from 'vscode-ws-jsonrpc/lib/server/connection';
import * as launch from 'vscode-ws-jsonrpc/lib/server/launch';
import { ContributionProvider, ConnectionHandler, bindContributionProvider } from '../../common';
import { WebSocketChannel } from '../../common/messaging/web-socket-channel';
import { BackendApplicationContribution } from '../backend-application';
import { MessagingService, WebSocketChannelConnection } from './messaging-service';
import { ConsoleLogger } from './logger';
import { ConnectionContainerModule } from './connection-container-module';
import Route = require('route-parser');
import { WsRequestValidator } from '../ws-request-validators';
import { MessagingListener } from './messaging-listeners';

export const MessagingContainer = Symbol('MessagingContainer');

@injectable()
export class MessagingContribution implements BackendApplicationContribution, MessagingService {

    @inject(MessagingContainer)
    protected readonly container: interfaces.Container;

    @inject(ContributionProvider) @named(ConnectionContainerModule)
    protected readonly connectionModules: ContributionProvider<interfaces.ContainerModule>;

    @inject(ContributionProvider) @named(MessagingService.Contribution)
    protected readonly contributions: ContributionProvider<MessagingService.Contribution>;

    @inject(WsRequestValidator)
    protected readonly wsRequestValidator: WsRequestValidator;

    @inject(MessagingListener)
    protected readonly messagingListener: MessagingListener;

    protected readonly wsHandlers = new MessagingContribution.ConnectionHandlers<Socket>();
    protected readonly channelHandlers = new MessagingContribution.ConnectionHandlers<WebSocketChannel>();

    @postConstruct()
    protected init(): void {
        this.ws(WebSocketChannel.wsPath, (_, socket) => this.handleChannels(socket));
        for (const contribution of this.contributions.getContributions()) {
            contribution.configure(this);
        }
    }

    listen(spec: string, callback: (params: MessagingService.PathParams, connection: MessageConnection) => void): void {
        this.wsChannel(spec, (params, channel) => {
            const connection = createWebSocketConnection(channel, new ConsoleLogger());
            callback(params, connection);
        });
    }

    forward(spec: string, callback: (params: MessagingService.PathParams, connection: IConnection) => void): void {
        this.wsChannel(spec, (params, channel) => {
            const connection = launch.createWebSocketConnection(channel);
            callback(params, WebSocketChannelConnection.create(connection, channel));
        });
    }

    wsChannel(spec: string, callback: (params: MessagingService.PathParams, channel: WebSocketChannel) => void): void {
        this.channelHandlers.push(spec, (params, channel) => callback(params, channel));
    }

    ws(spec: string, callback: (params: MessagingService.PathParams, socket: Socket) => void): void {
        this.wsHandlers.push(spec, callback);
    }

    protected checkAliveTimeout = 30000; // 30 seconds
    protected maxHttpBufferSize = 1e8; // 100 MB

    onStart(server: http.Server | https.Server): void {
        const socketServer = new Server(server, {
            pingInterval: this.checkAliveTimeout,
            pingTimeout: this.checkAliveTimeout * 2,
            maxHttpBufferSize: this.maxHttpBufferSize
        });
        // Accept every namespace by using /.*/
        socketServer.of(/.*/).on('connection', async socket => {
            const request = socket.request;
            // Socket.io strips the `origin` header of the incoming request
            // We provide a `fix-origin` header in the `WebSocketConnectionProvider`
            request.headers.origin = request.headers['fix-origin'] as string;
            if (await this.allowConnect(socket.request)) {
                this.handleConnection(socket);
                this.messagingListener.onDidWebSocketUpgrade(socket.request, socket);
            } else {
                socket.disconnect(true);
            }
        });
    }

    protected handleConnection(socket: Socket): void {
        const pathname = socket.nsp.name;
        if (pathname && !this.wsHandlers.route(pathname, socket)) {
            console.error('Cannot find a ws handler for the path: ' + pathname);
        }
    }

    protected async allowConnect(request: http.IncomingMessage): Promise<boolean> {
        try {
            return this.wsRequestValidator.allowWsUpgrade(request);
        } catch (e) {
            return false;
        }
    }

    protected handleChannels(socket: Socket): void {
        const channelHandlers = this.getConnectionChannelHandlers(socket);
        const channels = new Map<number, WebSocketChannel>();
        socket.on('message', data => {
            try {
                const message: WebSocketChannel.Message = JSON.parse(data.toString());
                if (message.kind === 'open') {
                    const { id, path } = message;
                    const channel = this.createChannel(id, socket);
                    if (channelHandlers.route(path, channel)) {
                        channel.ready();
                        console.debug(`Opening channel for service path '${path}'. [ID: ${id}]`);
                        channels.set(id, channel);
                        channel.onClose(() => {
                            console.debug(`Closing channel on service path '${path}'. [ID: ${id}]`);
                            channels.delete(id);
                        });
                    } else {
                        console.error('Cannot find a service for the path: ' + path);
                    }
                } else {
                    const { id } = message;
                    const channel = channels.get(id);
                    if (channel) {
                        channel.handleMessage(message);
                    } else {
                        console.error('The ws channel does not exist', id);
                    }
                }
            } catch (error) {
                console.error('Failed to handle message', { error, data });
            }
        });
        socket.on('error', err => {
            for (const channel of channels.values()) {
                channel.fireError(err);
            }
        });
        socket.on('disconnect', reason => {
            for (const channel of channels.values()) {
                channel.close(undefined, reason);
            }
            channels.clear();
        });
    }

    protected createSocketContainer(socket: Socket): Container {
        const connectionContainer: Container = this.container.createChild() as Container;
        connectionContainer.bind(Socket).toConstantValue(socket);
        return connectionContainer;
    }

    protected getConnectionChannelHandlers(socket: Socket): MessagingContribution.ConnectionHandlers<WebSocketChannel> {
        const connectionContainer = this.createSocketContainer(socket);
        bindContributionProvider(connectionContainer, ConnectionHandler);
        connectionContainer.load(...this.connectionModules.getContributions());
        const connectionChannelHandlers = new MessagingContribution.ConnectionHandlers(this.channelHandlers);
        const connectionHandlers = connectionContainer.getNamed<ContributionProvider<ConnectionHandler>>(ContributionProvider, ConnectionHandler);
        for (const connectionHandler of connectionHandlers.getContributions(true)) {
            connectionChannelHandlers.push(connectionHandler.path, (_, channel) => {
                const connection = createWebSocketConnection(channel, new ConsoleLogger());
                connectionHandler.onConnection(connection);
            });
        }
        return connectionChannelHandlers;
    }

    protected createChannel(id: number, socket: Socket): WebSocketChannel {
        return new WebSocketChannel(id, content => {
            if (socket.connected) {
                socket.send(content);
            }
        });
    }

}

export namespace MessagingContribution {
    export class ConnectionHandlers<T> {
        protected readonly handlers: ((path: string, connection: T) => string | false)[] = [];

        constructor(
            protected readonly parent?: ConnectionHandlers<T>
        ) { }

        push(spec: string, callback: (params: MessagingService.PathParams, connection: T) => void): void {
            const route = new Route(spec);
            this.handlers.push((path, channel) => {
                const params = route.match(path);
                if (!params) {
                    return false;
                }
                callback(params, channel);
                return route.reverse(params);
            });
        }

        route(path: string, connection: T): string | false {
            for (const handler of this.handlers) {
                try {
                    const result = handler(path, connection);
                    if (result) {
                        return result;
                    }
                } catch (e) {
                    console.error(e);
                }
            }
            if (this.parent) {
                return this.parent.route(path, connection);
            }
            return false;
        }
    }
}
