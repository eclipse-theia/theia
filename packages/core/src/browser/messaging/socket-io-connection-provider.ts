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
import * as socket_io from 'socket.io-client';
import { v4 } from 'uuid';

export interface SocketIoParams {
    path: string
    query?: Record<string, string>
}

@injectable()
export class SocketIoConnectionProvider implements ConnectionProvider<any, SocketIoParams> {

    protected frontendId = this.getFrontendId();

    open(params: SocketIoParams): Connection<any> {
        return new SocketIoConnection(socket_io.io(params.path, {
            query: {
                THEIA_FRONTEND_ID: this.frontendId
            }
        }));
    }

    protected getFrontendId(): string {
        return v4();
    }
}

export class SocketIoConnection extends AbstractConnection<any> {

    state = Connection.State.OPENING;

    constructor(
        protected socket: socket_io.Socket
    ) {
        super();
        this.socket.once('connect', () => this.setOpenedAndEmit());
        this.socket.on('message', message => this.onMessageEmitter.fire(message));
        this.socket.once('disconnect', () => {
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
