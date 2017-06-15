/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Endpoint } from '../../application/common/endpoint';
import { injectable } from "inversify";
import { listen as doListen, Logger, ConsoleLogger } from "vscode-ws-jsonrpc";
import { ConnectionHandler, JsonRpcProxyFactory, JsonRpcProxy } from "../common";
const ReconnectingWebSocket = require('reconnecting-websocket');

export interface WebSocketOptions {
    /**
     * True by default.
     */
    reconnecting?: boolean;
}

@injectable()
export class WebSocketConnectionProvider {

    /**
     * Create a proxy object to remote interface of T type
     * over a web socket connection for the given path.
     *
     * An optional target can be provided to handle
     * notifications and requests from a remote side.
     */
    createProxy<T extends object>(path: string, target?: object, options?: WebSocketOptions): JsonRpcProxy<T> {
        const factory = new JsonRpcProxyFactory<T>(target);
        this.listen({
            path,
            onConnection: c => factory.listen(c)
        }, options);
        return factory.createProxy();
    }

    /**
     * Install a connection handler for the given path.
     */
    listen(handler: ConnectionHandler, options?: WebSocketOptions): void {
        const url = this.createWebSocketUrl(handler.path);
        const webSocket = this.createWebSocket(url, options);

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

    /**
     * Creates a websocket URL to the current location
     */
    createWebSocketUrl(path: string): string {
        const endpoint = new Endpoint({ path })
        return endpoint.getWebSocketUrl().toString()
    }

    /**
     * Creates a web socket for the given url
     */
    createWebSocket(url: string, options?: WebSocketOptions): WebSocket {
        if (options === undefined || options.reconnecting) {
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
        return new WebSocket(url);
    }

}