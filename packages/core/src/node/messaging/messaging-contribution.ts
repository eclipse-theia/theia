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

import * as ws from 'ws';
import * as url from 'url';
import * as http from 'http';
import * as https from 'https';
import { injectable, inject, named, postConstruct, interfaces } from 'inversify';
// tslint:disable-next-line:no-implicit-dependencies
import { MessageConnection } from 'vscode-jsonrpc';
import { createWebSocketConnection } from 'vscode-ws-jsonrpc/lib/socket/connection';
import { IConnection } from 'vscode-ws-jsonrpc/lib/server/connection';
import * as launch from 'vscode-ws-jsonrpc/lib/server/launch';
import { ContributionProvider, ConnectionHandler, bindContributionProvider } from '../../common';
import { WebSocketChannel } from '../../common/messaging/web-socket-channel';
import { BackendApplicationContribution } from '../backend-application';
import { MessagingService } from './messaging-service';
import { ConsoleLogger } from './logger';
import { ConnectionContainerModule } from './connection-container-module';

import Route = require('route-parser');

export const MessagingContainer = Symbol('MessagingContainer');

@injectable()
export class MessagingContribution implements BackendApplicationContribution, MessagingService {

    @inject(MessagingContainer)
    protected readonly container: interfaces.Container;

    @inject(ContributionProvider) @named(ConnectionContainerModule)
    protected readonly connectionModules: ContributionProvider<interfaces.ContainerModule>;

    @inject(ContributionProvider) @named(MessagingService.Contribution)
    protected readonly contributions: ContributionProvider<MessagingService.Contribution>;

    protected readonly wsHandlers = new MessagingContribution.ConnectionHandlers<ws>();
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
            callback(params, connection);
        });
    }

    wsChannel(spec: string, callback: (params: MessagingService.PathParams, channel: WebSocketChannel) => void): void {
        this.channelHandlers.push(spec, (params, channel) => callback(params, channel));
    }

    ws(spec: string, callback: (params: MessagingService.PathParams, socket: ws) => void): void {
        this.wsHandlers.push(spec, callback);
    }

    protected checkAliveTimeout = 30000;
    onStart(server: http.Server | https.Server): void {
        const wss = new ws.Server({
            server,
            perMessageDeflate: false
        });
        interface CheckAliveWS extends ws {
            alive: boolean;
        }
        wss.on('connection', (socket: CheckAliveWS, request) => {
            socket.alive = true;
            socket.on('pong', () => socket.alive = true);
            this.handleConnection(socket, request);
        });
        setInterval(() => {
            wss.clients.forEach((socket: CheckAliveWS) => {
                if (socket.alive === false) {
                    socket.terminate();
                    return;
                }
                socket.alive = false;
                socket.ping();
            });
        }, this.checkAliveTimeout);
    }

    protected handleConnection(socket: ws, request: http.IncomingMessage): void {
        const pathname = request.url && url.parse(request.url).pathname;
        if (pathname && !this.wsHandlers.route(pathname, socket)) {
            console.error('Cannot find a ws handler for the path: ' + pathname);
        }
    }

    protected handleChannels(socket: ws): void {
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
                        channels.set(id, channel);
                        channel.onClose(() => channels.delete(id));
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
        socket.on('close', (code, reason) => {
            for (const channel of [...channels.values()]) {
                channel.close(code, reason);
            }
            channels.clear();
        });
    }

    protected getConnectionChannelHandlers(socket: ws): MessagingContribution.ConnectionHandlers<WebSocketChannel> {
        const connectionContainer = this.container.createChild();
        connectionContainer.bind(ws).toConstantValue(socket);
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

    protected createChannel(id: number, socket: ws): WebSocketChannel {
        return new WebSocketChannel(id, content => {
            if (socket.readyState < ws.CLOSING) {
                socket.send(content, err => {
                    if (err) {
                        throw err;
                    }
                });
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
