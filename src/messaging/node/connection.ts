import {MessageConnection} from "vscode-jsonrpc";
import {Server} from "ws";
import {createSocketConnection} from "../common";

export function createServerWebSocketConnection(server: Server, onConnect: (connection: MessageConnection) => void): void {
    server.on('connection', (webSocket) => {
        createSocketConnection({
            send: content => webSocket.send(content),
            onOpen: cb => webSocket.onopen = cb,
            onMessage: cb => webSocket.onmessage = event => cb(event.data),
            onError: cb => webSocket.onerror = err => cb(err),
            onClose: (cb) => webSocket.onclose = event => cb(event.code, event.reason)
        }, onConnect);
    });
}
