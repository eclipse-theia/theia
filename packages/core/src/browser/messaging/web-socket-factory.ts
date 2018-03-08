/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
const ReconnectingWebSocket = require('reconnecting-websocket');

export interface WebSocketOptions {
    url: string
    reconnecting: boolean
}

@injectable()
export class WebSocketFactory {

    createWebSocket(options: WebSocketOptions): WebSocket {
        if (options.reconnecting) {
            const socketOptions = {
                maxReconnectionDelay: 10000,
                minReconnectionDelay: 1000,
                reconnectionDelayGrowFactor: 1.3,
                connectionTimeout: 10000,
                maxRetries: Infinity,
                debug: false
            };
            return new ReconnectingWebSocket(options.url, undefined, socketOptions);
        }
        return new WebSocket(options.url);
    }

}
