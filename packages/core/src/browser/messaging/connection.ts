/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, interfaces } from "inversify";
import { listen as doListen, Logger, ConsoleLogger } from "vscode-ws-jsonrpc";
import { ConnectionHandler, JsonRpcProxyFactory, JsonRpcProxy } from "../../common";
import { Endpoint } from "../endpoint";
const WebSocketKeepAlive = require('wska');

@injectable()
export class WebSocketConnectionProvider {

    static createProxy<T extends object>(container: interfaces.Container, path: string, target?: object): JsonRpcProxy<T> {
        return container.get(WebSocketConnectionProvider).createProxy<T>(path, target);
    }

    /**
     * Create a proxy object to remote interface of T type
     * over a web socket connection for the given path.
     *
     * An optional target can be provided to handle
     * notifications and requests from a remote side.
     */
    createProxy<T extends object>(path: string, target?: object): JsonRpcProxy<T> {
        const factory = new JsonRpcProxyFactory<T>(target);
        this.listen({
            path,
            onConnection: c => factory.listen(c)
        });
        return factory.createProxy();
    }

    /**
     * Install a connection handler for the given path.
     */
    listen(handler: ConnectionHandler): void {
        const url = this.createWebSocketUrl(handler.path);
        const webSocket = this.createWebSocket(url);

        const logger = this.createLogger();
        webSocket.onerror = function (error: Event) {
            logger.error('' + error);
            return;
        };
        doListen({
            webSocket,
            onConnection: handler.onConnection.bind(handler),
            logger
        });
    }

    protected createLogger(): Logger {
        return new ConsoleLogger();
    }

    /**
     * Creates a websocket URL to the current location
     */
    createWebSocketUrl(path: string): string {
        const endpoint = new Endpoint({ path });
        return endpoint.getWebSocketUrl().toString();
    }

    /**
     * Creates a web socket for the given url
     */
    createWebSocket(url: string): WebSocket {
        return new WebSocketKeepAlive(url, null, null, { pingMessage: 'ping' });
    }

}
