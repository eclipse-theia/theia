/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import { inject, injectable, postConstruct } from 'inversify';
import { ChannelHandler, ChannelHandlerFactory } from '../../common/messaging/channel';
import { Connection } from '../../common/messaging/connection';
import { WebSocketConnection } from '../../common/messaging/websocket-connection';
import { ConnectionProvider, ConnectOptions } from './connection-provider';

/**
 * Provide multiplexed connections over a single WebSocket connection.
 */
@injectable()
export class WebSocketConnectionProvider implements ConnectionProvider {

    protected mainWsConnection: Connection;
    protected channelHandler: ChannelHandler;

    @inject(ChannelHandlerFactory)
    protected channelHandlerFactory: ChannelHandlerFactory;

    @postConstruct()
    protected postConstruct(): void {
        const ws = this.createWebSocket();
        this.mainWsConnection = this.createConnection(ws);
        this.channelHandler = this.channelHandlerFactory(this.mainWsConnection);
    }

    async connect(serviceId: string, options?: ConnectOptions): Promise<Connection> {
        return this.channelHandler.openOutgoingChannel();
    }

    protected createWebSocket(): WebSocket {
        return new WebSocket('todo');
    }

    protected createConnection(ws: WebSocket): Connection {
        return new WebSocketConnection(ws);
    }
}
