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

import * as http from 'http';
import * as https from 'https';
import { Container, inject, injectable, interfaces, named, postConstruct } from 'inversify';
import { Server, Socket } from 'socket.io';
import { ContributionProvider, ConnectionHandler, bindContributionProvider } from '../../common';
import { IWebSocket, WebSocketChannel } from '../../common/messaging/web-socket-channel';
import { BackendApplicationContribution } from '../backend-application';
import { MessagingService } from './messaging-service';
import { ConnectionContainerModule } from './connection-container-module';
import Route = require('route-parser');
import { WsRequestValidator } from '../ws-request-validators';
import { MessagingListener } from './messaging-listeners';
import { toArrayBuffer } from '../../common/message-rpc/array-buffer-message-buffer';
import { Channel, ChannelMultiplexer } from '../../common/message-rpc';

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
    protected readonly channelHandlers = new MessagingContribution.ConnectionHandlers<Channel>();

    @postConstruct()
    protected init(): void {
        this.ws(WebSocketChannel.wsPath, (_, socket) => this.handleChannels(socket));
        for (const contribution of this.contributions.getContributions()) {
            contribution.configure(this);
        }
    }

    wsChannel(spec: string, callback: (params: MessagingService.PathParams, channel: Channel) => void): void {
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
        const socketChannel = new WebSocketChannel(toIWebSocket(socket));
        const mulitplexer = new ChannelMultiplexer(socketChannel);
        const channelHandlers = this.getConnectionChannelHandlers(socket);
        mulitplexer.onDidOpenChannel(event => {
            if (channelHandlers.route(event.id, event.channel)) {
                console.debug(`Opening channel for service path '${event.id}'.`);
                event.channel.onClose(() => console.debug(`Closing channel on service path '${event.id}'.`));
            }
        });
    }

    protected createSocketContainer(socket: Socket): Container {
        const connectionContainer: Container = this.container.createChild() as Container;
        connectionContainer.bind(Socket).toConstantValue(socket);
        return connectionContainer;
    }

    protected getConnectionChannelHandlers(socket: Socket): MessagingContribution.ConnectionHandlers<Channel> {
        const connectionContainer = this.createSocketContainer(socket);
        bindContributionProvider(connectionContainer, ConnectionHandler);
        connectionContainer.load(...this.connectionModules.getContributions());
        const connectionChannelHandlers = new MessagingContribution.ConnectionHandlers(this.channelHandlers);
        const connectionHandlers = connectionContainer.getNamed<ContributionProvider<ConnectionHandler>>(ContributionProvider, ConnectionHandler);
        for (const connectionHandler of connectionHandlers.getContributions(true)) {
            connectionChannelHandlers.push(connectionHandler.path, (_, channel) => {
                connectionHandler.onConnection(channel);
            });
        }
        return connectionChannelHandlers;
    }

}

function toIWebSocket(socket: Socket): IWebSocket {
    return {
        close: () => {
            socket.disconnect();
        },
        isConnected: () => socket.connected,
        onClose: cb => socket.on('disconnect', reason => cb(reason)),
        onError: cb => socket.on('error', error => cb(error)),
        onMessage: cb => socket.on('message', data => cb(toArrayBuffer(data))),
        send: message => socket.emit('message', message)
    };
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
