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

export type SocketIoAuth = object | ((cb: (auth: object) => void) => void);

export interface SocketIoParams {
    path: string
    options?: ManagerOptions & SocketOptions
}

@injectable()
export class SocketIoConnectionProvider implements ConnectionProvider<any, SocketIoParams> {

    @inject(FrontendInstance)
    protected frontendInstance: FrontendInstance;

    open(params: SocketIoParams): Connection<any> {
        return new SocketIoConnection(io(this.createWebSocketUrl(params.path), {
            multiplex: false,
            ...params.options,
            auth: this.createAuth(params.options?.auth, {
                THEIA_FRONTEND_ID: this.frontendInstance.id
            })
        }));
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

export class SocketIoConnection extends AbstractConnection<any> {

    state: Connection.State;

    constructor(
        protected socket: Socket
    ) {
        super();
        if (this.socket.connected) {
            this.state = Connection.State.OPENED;
        } else {
            this.state = Connection.State.OPENING;
            this.socket.once('connect', () => this.setOpenedAndEmit());
        }
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
