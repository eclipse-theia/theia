import * as ws from "ws";
import * as http from "http";
import * as url from "url";
import * as net from "net";
import { MessageConnection } from "vscode-jsonrpc";
import { createSocketConnection, Socket } from "../common";
import { ConsoleLogger } from "./logger";

export interface IServerOptions {
    readonly server: http.Server;
    readonly path: string;
}

export function createServerWebSocketConnection(options: IServerOptions, onConnect: (connection: MessageConnection) => void): void {
    openSocket(options, socket => onConnect(createSocketConnection(socket, new ConsoleLogger())));
}

export function openSocket(options: IServerOptions, onOpen: (socket: Socket) => void): void {
    // FIXME consider to have one web socket connection per a client and do dispatching on upgrade
    const wss = new ws.Server({
        noServer: true,
        perMessageDeflate: false
    });
    options.server.on('upgrade', (request: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
        const pathname = request.url ? url.parse(request.url).pathname : undefined;
        if (pathname === options.path) {
            wss.handleUpgrade(request, socket, head, webSocket => {
                const socket: Socket = {
                    send: content => webSocket.send(content, error => {
                        if (error) {
                            throw error;
                        }
                    }),
                    onMessage: cb => webSocket.on('message', cb),
                    onError: cb => webSocket.on('error', cb),
                    onClose: cb => webSocket.on('close', cb),
                    dispose: () => webSocket.close()
                };
                if (webSocket.readyState === webSocket.OPEN) {
                    onOpen(socket);
                } else {
                    webSocket.on('open', () => onOpen(socket));
                }
            });
        }
    });
}
