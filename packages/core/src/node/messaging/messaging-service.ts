/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as ws from 'ws';
import { MessageConnection } from 'vscode-jsonrpc';
import { IConnection } from 'vscode-ws-jsonrpc/lib/server/connection';
import { WebSocketChannel } from '../../common/messaging/web-socket-channel';

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
     * Accept a web socket channel on the given path.
     * A path supports the route syntax: https://github.com/rcs/route-parser#what-can-i-use-in-my-routes.
     */
    wsChannel(path: string, callback: (params: MessagingService.PathParams, socket: WebSocketChannel) => void): void;
    /**
     * Accept a web socket connection on the given path.
     * A path supports the route syntax: https://github.com/rcs/route-parser#what-can-i-use-in-my-routes.
     *
     * #### Important
     * Prefer JSON-RPC connections or web socket channels over web sockets. Clients can handle only limited amount of web sockets
     * and excessive amount can cause performance degradation. All JSON-RPC connections and web socket channels share the single web socket connection.
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
