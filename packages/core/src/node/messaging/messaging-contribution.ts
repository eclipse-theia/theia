/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as ws from 'ws';
import * as url from 'url';
import * as http from 'http';
import * as https from 'https';
import { injectable, inject, named, postConstruct } from "inversify";
import { MessageConnection } from 'vscode-jsonrpc';
import { createWebSocketConnection } from 'vscode-ws-jsonrpc/lib/socket/connection';
import { IConnection } from 'vscode-ws-jsonrpc/lib/server/connection';
import * as launch from 'vscode-ws-jsonrpc/lib/server/launch';
import { IWebSocket } from 'vscode-ws-jsonrpc/lib/socket/socket';
import { ContributionProvider, ConnectionHandler } from '../../common';
import { BackendApplicationContribution } from "../backend-application";
import { MessagingService } from './messaging-service';
import { ConsoleLogger } from "./logger";

import Route = require('route-parser');

@injectable()
export class MessagingContribution implements BackendApplicationContribution, MessagingService {

    @inject(ContributionProvider) @named(ConnectionHandler)
    protected readonly handlers: ContributionProvider<ConnectionHandler>;

    @inject(ContributionProvider) @named(MessagingService.Contribution)
    protected readonly contributions: ContributionProvider<MessagingService.Contribution>;

    @postConstruct()
    protected init(): void {
        for (const contribution of this.contributions.getContributions()) {
            contribution.configure(this);
        }
        for (const handler of this.handlers.getContributions()) {
            this.listen(handler.path, (params, connection) =>
                handler.onConnection(connection)
            );
        }
    }

    listen(spec: string, callback: (params: MessagingService.Params, connection: MessageConnection) => void): void {
        return this.pushAcceptor(spec, (params, socket) => {
            const connection = createWebSocketConnection(this.toIWebSocket(socket), new ConsoleLogger());
            callback(params, connection);
        });
    }

    forward(spec: string, callback: (params: MessagingService.Params, connection: IConnection) => void): void {
        return this.pushAcceptor(spec, (params, socket) => {
            const connection = launch.createWebSocketConnection(this.toIWebSocket(socket));
            callback(params, connection);
        });
    }

    protected readonly acceptors: ((path: string, socket: ws) => boolean)[] = [];
    protected pushAcceptor(spec: string, callback: (params: MessagingService.Params, socket: ws) => void): void {
        const route = new Route(spec);
        this.acceptors.push((path, socket) => {
            const params = route.match(path);
            if (!params) {
                return false;
            }
            callback(params, socket);
            return true;
        });
    }
    protected dispatch(socket: ws, request: http.IncomingMessage): void {
        const pathname = request.url && url.parse(request.url).pathname;
        if (!pathname) {
            return;
        }
        for (const acceptor of this.acceptors) {
            try {
                if (acceptor(pathname, socket)) {
                    return;
                }
            } catch (e) {
                console.error(e);
            }
        }
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
            this.dispatch(socket, request);
        });
        setInterval(() => {
            wss.clients.forEach((socket: CheckAliveWS) => {
                if (socket.alive === false) {
                    return socket.terminate();
                }
                socket.alive = false;
                socket.ping();
            });
        }, this.checkAliveTimeout);
    }

    protected toIWebSocket(webSocket: ws): IWebSocket {
        return <IWebSocket>{
            send: content => webSocket.send(content, error => {
                if (error) {
                    console.log(error);
                }
            }),
            onMessage: cb => webSocket.on('message', cb),
            onError: cb => webSocket.on('error', cb),
            onClose: cb => webSocket.on('close', cb),
            dispose: () => {
                if (webSocket.readyState < ws.CLOSING) {
                    webSocket.close();
                }
            }
        };
    }

}
