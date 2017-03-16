import {MessageConnection} from "vscode-jsonrpc";
import {createSocketConnection} from "../common";
import {ConsoleLogger} from "./logger";
import {ConnectionHandler} from "../common/handler";
const WebSocket = require('reconnecting-websocket');

export function listen(handler: ConnectionHandler): void {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${location.host || "127.0.0.1:3000"}${handler.path}`;
    createClientWebSocketConnection(url, connection => handler.onConnection(connection));
}

export function createClientWebSocketConnection(url: string, onConnect: (connection: MessageConnection) => void): void {
    const webSocket = createWebSocket(url);
    webSocket.onopen = () => {
        const connection = createSocketConnection({
            send: content => webSocket.send(content),
            onMessage: cb => webSocket.onmessage = event => cb(event.data),
            onError: cb => webSocket.onerror = event => {
                if (event instanceof ErrorEvent) {
                    cb(event.message)
                }
            },
            onClose: (cb) => webSocket.onclose = event => cb(event.code, event.reason)
        }, new ConsoleLogger());
        onConnect(connection);
    };
}

export function createWebSocket(url: string): WebSocket {
    const options = {
        maxReconnectionDelay: 10000,
        minReconnectionDelay: 1000,
        reconnectionDelayGrowFactor: 1.3,
        connectionTimeout: 4000,
        maxRetries: Infinity,
        debug: false,
    };
    return new WebSocket(url, undefined, options);
}
