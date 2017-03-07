const WebSocket = require('reconnecting-websocket');

import {createMessageConnection, MessageConnection} from "vscode-jsonrpc";
import {ConsoleLogger} from "../common";
import {WebSocketMessageReader} from "./reader";
import {WebSocketMessageWriter} from "./writer";

export function createWebSocketConnection(url: string, onConnect: (connection: MessageConnection) => void): void {
    const socket = createWebSocket(url);
    socket.onopen = () => {
        const logger = new ConsoleLogger();
        const messageReader = new WebSocketMessageReader(socket);
        const messageWriter = new WebSocketMessageWriter(socket);
        const connection = createMessageConnection(messageReader, messageWriter, logger);
        connection.onClose(() => connection.dispose());
        onConnect(connection);
    }
}

function createWebSocket(url: string): WebSocket {
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

