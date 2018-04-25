/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as ws from 'ws';
import { MessageConnection } from "vscode-jsonrpc";
import { IConnection } from "vscode-ws-jsonrpc/lib/server/connection";

export interface MessagingService {
    /**
     * Accept a JSON-RPC connection on the given path.
     * A path supports the route syntax: https://github.com/rcs/route-parser#what-can-i-use-in-my-routes.
     */
    listen(path: string, callback: (params: MessagingService.PathParams, connection: MessageConnection) => void): void;
    /**
     * Accept a raw JSON-RPC connection on the given path.
     * A path supports the route syntax: https://github.com/rcs/route-parser#what-can-i-use-in-my-routes.
     */
    forward(path: string, callback: (params: MessagingService.PathParams, connection: IConnection) => void): void;
    /**
     * Accept a web socket connection on the given path.
     * A path supports the route syntax: https://github.com/rcs/route-parser#what-can-i-use-in-my-routes.
     *
     * #### Important
     * Prefer JSON-RPC connections over web sockets. Clients can handle only limited amount of web sockets
     * and excessive amount can cause performance degradation. All JSON-RPC connections share the single web socket connection.
     */
    ws(path: string, callback: (params: MessagingService.PathParams, socket: ws) => void): void;
}
export namespace MessagingService {
    export interface PathParams {
        [name: string]: string
    }
    export const Contribution = Symbol('MessagingService.Contribution');
    export interface Contribution {
        configure(service: MessagingService): void;
    }
}
