/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as ws from "ws";
import * as http from "http";
import * as https from "https";
import * as url from "url";
import * as net from "net";
import { MessageConnection } from "vscode-jsonrpc";
import { createWebSocketConnection, IWebSocket } from "vscode-ws-jsonrpc";
import { ConsoleLogger } from "./logger";

export interface ExtWebSocket extends ws {
    isAlive: boolean;
}

export interface IServerOptions {
    readonly server: http.Server | https.Server;
    readonly path?: string;
    matches?(request: http.IncomingMessage): boolean;
}

export function createServerWebSocketConnection(options: IServerOptions, onConnect: (connection: MessageConnection) => void): void {
    openJsonRpcSocket(options, socket => {
        const logger = new ConsoleLogger();
        const connection = createWebSocketConnection(socket, logger);
        onConnect(connection);
    });
}

export function openJsonRpcSocket(options: IServerOptions, onOpen: (socket: IWebSocket) => void): void {
    openSocket(options, socket => {
        const webSocket = toIWebSocket(socket);
        onOpen(webSocket);
    });
}

export interface OnOpen {
    (webSocket: ws, request: http.IncomingMessage, socket: net.Socket, head: Buffer): void;
}

export function openSocket(options: IServerOptions, onOpen: OnOpen): void {

    const wss = new ws.Server({
        noServer: true,
        perMessageDeflate: false
    });

    wss.on('connection', (websocket: ws) => {

        const extWs = websocket as ExtWebSocket;
        extWs.isAlive = true;

        extWs.on('pong', () => {
            extWs.isAlive = true;
        });

    });

    setInterval(() => {
        wss.clients.forEach(websocket => {
            const extWs = websocket as ExtWebSocket;

            if (extWs.isAlive === false) {
                websocket.terminate();
                return;
            }

            extWs.isAlive = false;
            websocket.ping();
        });

    }, 30000);

    options.server.on('upgrade', (request: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
        const pathname = request.url ? url.parse(request.url).pathname : undefined;
        if (options.path && pathname === options.path || options.matches && options.matches(request)) {
            wss.handleUpgrade(request, socket, head, webSocket => {
                if (webSocket.readyState === webSocket.OPEN) {
                    onOpen(webSocket, request, socket, head);
                    wss.emit('connection', webSocket);
                } else {
                    webSocket.on('open', () => {
                        onOpen(webSocket, request, socket, head);
                        wss.emit('connection', webSocket);
                    });
                }
            });
        }
    });
}

export function toIWebSocket(webSocket: ws) {
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
