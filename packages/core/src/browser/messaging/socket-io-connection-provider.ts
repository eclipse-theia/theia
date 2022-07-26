// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */

import { injectable } from 'inversify';
import { AbstractConnection, Connection, ConnectionProvider } from '../../common';
import { io, Socket } from 'socket.io-client';
import { v4 } from 'uuid';
import { Endpoint } from '../endpoint';

export interface SocketIoParams {
    path: string
    query?: Record<string, string>
}

@injectable()
export class SocketIoConnectionProvider implements ConnectionProvider<any, SocketIoParams> {

    protected frontendId = this.getFrontendId();

    open(params: SocketIoParams): Connection<any> {
        return new SocketIoConnection(io(this.createWebSocketUrl(params.path), {
            query: {
                THEIA_FRONTEND_ID: this.frontendId
            }
        }));
    }

    protected getFrontendId(): string {
        return v4();
    }

    /**
     * @param serviceId The handler to reach in the backend.
     */
    protected createWebSocketUrl(serviceId: string): string {
        // Since we are using Socket.io, the path should look like the following:
        // proto://domain.com/{path}
        return new Endpoint().getWebSocketUrl().withPath(serviceId).toString();
    }
}

export class SocketIoConnection extends AbstractConnection<any> {

    state = Connection.State.OPENING;

    constructor(
        protected socket: Socket
    ) {
        super();
        this.socket.once('connect', () => this.setOpenedAndEmit());
        this.socket.on('message', message => this.onMessageEmitter.fire(message));
        this.socket.once('disconnect', reason => {
            console.debug('SocketIoConnection disconnect:', reason);
            this.setClosedAndEmit();
            this.dispose();
        });
    }

    sendMessage(message: any): void {
        this.socket.send(message);
    }

    close(): void {
        this.ensureStateNot(Connection.State.CLOSING, Connection.State.CLOSED);
        this.state = Connection.State.CLOSING;
        this.socket.disconnect();
    }
}
