import { injectable } from "inversify";
import { listen as doListen, Logger, ConsoleLogger } from "vscode-ws-jsonrpc";
import { ConnectionHandler, JsonRpcProxyFactory } from "../common";
const ReconnectingWebSocket = require('reconnecting-websocket');

@injectable()
export class WebSocketConnection {

    /**
     * Create a proxy object to remote interface of T type
     * over a web socket connection for the given path.
     *
     * An optional target can be provided to handle
     * notifications and requests from a remote side.
     */
    createProxy<T>(path: string, target?: object): T {
        const factory = new JsonRpcProxyFactory<T>(path, target);
        this.listen(factory);
        return factory.createProxy();
    }

    /**
     * Install a connection handler for the given path.
     */
    listen(handler: ConnectionHandler): void {
        const url = this.createUrl(handler);
        const webSocket = this.createWebSocket(url);
        const logger = this.createLogger();
        webSocket.onerror = function (error: Event) {
            logger.error('' + error)
            return;
        }
        doListen({
            webSocket,
            onConnection: handler.onConnection.bind(handler),
            logger
        });
    }

    protected createLogger(): Logger {
        return new ConsoleLogger();
    }

    protected createUrl(handler: ConnectionHandler): string {
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        return `${protocol}://${location.host || "127.0.0.1:3000"}${handler.path}`;
    }

    protected createWebSocket(url: string): WebSocket {
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

}