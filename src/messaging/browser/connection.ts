import { createSocketConnection } from "../common";
import { ConsoleLogger } from "./logger";
import { ConnectionHandler } from "../common/handler";
const ReconnectingWebSocket = require('reconnecting-websocket');

export function listen(handler: ConnectionHandler): void {
    const url = createUrl(handler);
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
        handler.onConnection(connection);
    };
}

export function createUrl(handler: ConnectionHandler): string {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${location.host || "127.0.0.1:3000"}${handler.path}`;
}

export function createWebSocket(url: string): WebSocket {
    const socketOptions = {
        maxReconnectionDelay: 10000,
        minReconnectionDelay: 1000,
        reconnectionDelayGrowFactor: 1.3,
        connectionTimeout: 10000,
        maxRetries: Infinity,
        debug: false
    };
    return new ReconnectingWebSocket(url, undefined, socketOptions);
}

