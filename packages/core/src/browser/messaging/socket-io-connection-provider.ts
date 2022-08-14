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

import { inject, injectable } from 'inversify';
import { AbstractConnection, Connection, ConnectionProvider } from '../../common';
import { io, ManagerOptions, Socket, SocketOptions } from 'socket.io-client';
import { Endpoint } from '../endpoint';
import { FrontendInstance } from '../frontend-instance';
import { v4 } from 'uuid';

export type SocketIoAuth = object | ((cb: (auth: object) => void) => void);

export interface SocketIoParams {
    path: string
    reconnection?: boolean
    options?: ManagerOptions & SocketOptions
}

@injectable()
export class SocketIoConnectionProvider implements ConnectionProvider<any, SocketIoParams> {

    @inject(FrontendInstance)
    protected frontendInstance: FrontendInstance;

    open(params: SocketIoParams): Connection<any> {
        const reconnection = params.reconnection ?? false;
        const auth: Record<string, string> = {
            THEIA_FRONTEND_ID: this.frontendInstance.id
        };
        if (reconnection) {
            auth.THEIA_CONNECTION_ID = v4();
        }
        const socket = io(this.createWebSocketUrl(params.path), {
            multiplex: false,
            ...params.options,
            reconnection,
            auth: this.createAuth(params.options?.auth, auth)
        });
        return new SocketIoConnection(socket, {
            reconnection
        });
    }

    protected createAuth(auth?: SocketIoAuth, extra?: object): SocketIoAuth | undefined {
        if (!extra) {
            return auth;
        }
        if (auth) {
            if (typeof auth === 'object') {
                return { ...auth, ...extra };
            } else {
                return cb => auth(data => cb({ ...data, ...extra }));
            }
        }
        return extra;
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

export interface SocketIoConnectionOptions {
    reconnection?: boolean
}

export class SocketIoConnection extends AbstractConnection<any> {

    state: Connection.State;
    reconnection: boolean;

    constructor(
        protected socket: Socket,
        options?: SocketIoConnectionOptions
    ) {
        super();
        this.reconnection = options?.reconnection ?? false;
        if (this.socket.connected) {
            this.state = Connection.State.OPENED;
        } else {
            this.state = Connection.State.OPENING;
            this.socket.once('connect', () => this.setOpenedAndEmit());
        }
        this.socket.on('message', message => this.onMessageEmitter.fire(message));
        this.socket.once('disconnect', reason => {
            console.debug('SocketIoConnection disconnect:', reason);
            // Only mark this connection as closed if reconnection won't happen.
            // See https://socket.io/docs/v4/client-api/#event-disconnect
            if (!this.reconnection || reason.endsWith('disconnect')) {
                this.setClosedAndEmit();
                this.dispose();
            }
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
