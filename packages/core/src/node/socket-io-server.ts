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

/* eslint-disable @typescript-eslint/no-explicit-any, no-null/no-null */

import type * as http from 'http';
import { inject, injectable } from 'inversify';
import * as socket_io from 'socket.io';
import { pushDisposableListener } from '../common/node-event-utils';
import { AbstractConnection, Broker, Connection, Disposable } from '../common';
import { DefaultRouter, Handler, Middleware } from '../common/routing';
import { BackendApplicationConfigProvider } from './backend-application-config-provider';

const config = BackendApplicationConfigProvider.get();

export type SocketIoMiddleware = (socket: socket_io.Socket, next: (error?: any) => void) => void;

export interface SocketIoParams {
    socket: socket_io.Socket
}

@injectable()
export class SocketIoServer implements Broker<Connection<any>, SocketIoParams> {

    @inject(DefaultRouter)
    protected router: DefaultRouter<Connection<any>, SocketIoParams>;

    initialize(httpServer: http.Server): this {
        const server = this.createSocketIoServer(httpServer);
        const namespace = this.createSocketIoNamespace(server);
        const middleware = this.createSocketIoMiddleware();
        server.use(middleware);
        namespace.use(middleware);
        return this;
    }

    use(middleware: Middleware<SocketIoParams>): Disposable {
        return this.router.use(middleware);
    }

    listen(handler: Handler<Connection<any>, SocketIoParams>): Disposable {
        return this.router.listen(handler);
    }

    protected createSocketIoServer(httpServer: http.Server): socket_io.Server {
        return new socket_io.Server(httpServer, {
            serveClient: false,
            maxHttpBufferSize: 10 * 1024 * 1024, // bytes = 10 MB
            pingInterval: 30_000, // ms = 30 seconds
            pingTimeout: 3_600_000, // ms = 1 hour, virtually no timeout
            ...config?.socketIo?.serverOptions ?? {},
        });
    }

    /**
     * @note
     * Accept any namespace by default.
     */
    protected createSocketIoNamespace(socketServer: socket_io.Server): socket_io.Namespace {
        return socketServer.of((namespaceName, auth, next) => next(null, true));
    }

    protected createSocketIoMiddleware(): SocketIoMiddleware {
        return (socket, next) => {
            this.router.route({ socket }, () => {
                queueMicrotask(next);
                return this.createSocketIoConnection(socket);
            }, error => {
                if (error) {
                    next(new Error('internal server error'));
                } else {
                    next(new Error('unhandled connection'));
                }
            });
        };
    }

    protected createSocketIoConnection(socket: socket_io.Socket): SocketIoConnection {
        return new SocketIoConnection(socket);
    }
}

/**
 * @internal
 */
export class SocketIoConnection extends AbstractConnection<any> {

    state = Connection.State.OPENED;

    constructor(
        protected socket: socket_io.Socket
    ) {
        super();
        pushDisposableListener(this.disposables, socket, 'message', message => this.onMessageEmitter.fire(message));
        pushDisposableListener(this.disposables, socket, 'disconnect', reason => {
            console.debug('SocketIoConnection disconnect', reason);
            this.setClosedAndEmit();
            this.dispose();
        });
    }

    sendMessage(message: any): void {
        this.ensureState(Connection.State.OPENED);
        this.socket.send(message);
    }

    close(): void {
        this.ensureStateNot(Connection.State.CLOSING, Connection.State.CLOSED);
        this.state = Connection.State.CLOSING;
        this.socket.disconnect();
    }
}
