import {MessageConnection} from "vscode-jsonrpc";
import {Server} from "ws";
import {createSocketConnection} from "../common";
import {ConsoleLogger} from "./logger";

export function createServerWebSocketConnection(server: Server, onConnect: (connection: MessageConnection) => void): void {
    server.on('connection', webSocket => {
        const connection = createSocketConnection({
            send: content => webSocket.send(content, error => {
                if (error) {
                    throw error;
                }
            }),
            onMessage: cb => webSocket.on('message', cb),
            onError: cb => webSocket.on('error', cb),
            onClose: cb => webSocket.on('close', cb)
        }, new ConsoleLogger());
        if (webSocket.readyState === webSocket.OPEN) {
            onConnect(connection);
        } else {
            webSocket.on('open', () => onConnect(connection));
        }
    });
}
