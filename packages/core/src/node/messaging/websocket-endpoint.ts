// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

import { MessagingService } from './messaging-service';
import * as http from 'http';
import * as https from 'https';
import { inject, injectable, named } from 'inversify';
import { Server, Socket } from 'socket.io';
import { WsRequestValidator } from '../ws-request-validators';
import { MessagingListener } from './messaging-listeners';
import { ConnectionHandlers } from './default-messaging-service';
import { BackendApplicationContribution } from '../backend-application';
import { ILogger } from '../../common/logger';

@injectable()
export class WebsocketEndpoint implements BackendApplicationContribution {
    @inject(WsRequestValidator)
    protected readonly wsRequestValidator: WsRequestValidator;

    @inject(MessagingListener)
    protected readonly messagingListener: MessagingListener;

    @inject(ILogger) @named('core:WebsocketEndpoint')
    protected readonly logger: ILogger;

    protected checkAliveTimeout = 30000; // 30 seconds
    protected maxHttpBufferSize = 1e8; // 100 MB

    protected readonly wsHandlers = new ConnectionHandlers<Socket>();

    registerConnectionHandler(spec: string, callback: (params: MessagingService.PathParams, socket: Socket) => void): void {
        this.wsHandlers.push(spec, callback);
    }

    onStart(server: http.Server | https.Server): void {
        const socketServer = new Server(server, {
            pingInterval: this.checkAliveTimeout,
            pingTimeout: this.checkAliveTimeout * 2,
            maxHttpBufferSize: this.maxHttpBufferSize,
            allowRequest: (req, callback) => {
                // eslint-disable-next-line no-null/no-null
                const noError = null;
                this.wsRequestValidator.allowWsUpgrade(req).then(
                    allowed => callback(noError, allowed),
                    error => {
                        console.error('Error during WebSocket allowRequest validation:', error);
                        callback(error?.message ?? 'Validation error', false);
                    }
                );
            }
        });
        // Accept every namespace by using /.*/
        socketServer.of(/.*/).on('connection', async socket => {
            if (await this.allowConnect(socket.request)) {
                await this.handleConnection(socket);
                this.messagingListener.onDidWebSocketUpgrade(socket.request, socket);
            } else {
                socket.disconnect(true);
            }
        });
    }

    /**
     * Secondary validation after connection. The primary check happens in the
     * Socket.IO `allowRequest` callback at handshake time; this is kept as
     * defense-in-depth in case a Socket.IO upgrade path bypasses `allowRequest`.
     */
    protected async allowConnect(request: http.IncomingMessage): Promise<boolean> {
        try {
            return this.wsRequestValidator.allowWsUpgrade(request);
        } catch (e) {
            return false;
        }
    }

    protected async handleConnection(socket: Socket): Promise<void> {
        const pathname = socket.nsp.name;
        if (pathname && !this.wsHandlers.route(pathname, socket)) {
            this.logger.error('Cannot find a ws handler for the path: ' + pathname);
        }
    }
}

