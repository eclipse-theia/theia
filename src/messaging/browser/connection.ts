import {MessageConnection} from "vscode-jsonrpc";
const WebSocket = require('reconnecting-websocket');
import {createSocketConnection} from "../common";

export function createClientWebSocketConnection(url: string, onConnect: (connection: MessageConnection) => void): void {
    const webSocket = createWebSocket(url);
    createSocketConnection({
        send: content => webSocket.send(content),
        onOpen: cb => webSocket.onopen = cb,
        onMessage: cb => webSocket.onmessage = event => cb(event.data),
        onError: cb => webSocket.onerror = event => {
            if (event instanceof ErrorEvent) {
                cb(event.message)
            }
        },
        onClose: (cb) => webSocket.onclose = event => cb(event.code, event.reason)
    }, onConnect);
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
