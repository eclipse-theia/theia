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
import { injectable } from 'inversify';
import * as socket_io from 'socket.io';
import { pushDisposableListener } from '../common/node-event-utils';
import { AbstractConnection, Connection, FrontendConnectionParams, Router } from '../common';

/**
 * @internal
 */
export type SocketIoMiddleware = (socket: socket_io.Socket, next: (error?: Error) => void) => void;

/**
 * @internal
 */
export interface SocketIoServerOptions {
    middlewares?: SocketIoMiddleware[]
}

/**
 * @internal
 */
export interface SocketIoServerError extends Error {
    data?: {
        THEIA_BACKEND_ID?: string
    }
}

/**
 * @internal
 */
@injectable()
export class SocketIoServer {

    initialize(httpServer: http.Server, router: Router<Connection<any>>, options?: SocketIoServerOptions): void {
        const server = this.createSocketIoServer(httpServer);
        const namespace = this.createSocketIoNamespace(server);
        this.applyMiddlewares(namespace, options);
        // Route the connection, this must be the last middleware in the chain
        // to ensure the connection won't be refused after being accepted here:
        namespace.use(this.createRouterMiddleware(router));
    }

    protected createSocketIoServer(httpServer: http.Server): socket_io.Server {
        return new socket_io.Server(httpServer, {
            serveClient: false,
            pingInterval: 30_000, // ms = 30 seconds
            pingTimeout: 3_600_000 // ms = 1 hour, virtually no timeout
        });
    }

    /**
     * @note
     * Accept any namespace by default.
     */
    protected createSocketIoNamespace(socketServer: socket_io.Server): socket_io.Namespace {
        return socketServer.of((namespaceName, auth, next) => next(null, true));
    }

    protected applyMiddlewares(namespace: socket_io.Namespace, options?: SocketIoServerOptions): void {
        options?.middlewares?.forEach(middleware => namespace.use(middleware));
    }

    protected createRouterMiddleware(router: Router<Connection<any>, FrontendConnectionParams>): SocketIoMiddleware {
        return (socket, next) => {
            const frontendId = this.getFrontendId(socket);
            if (!frontendId) {
                console.debug('missing frontendId field in socket auth');
                return next(new Error('invalid connection'));
            }
            const path = socket.nsp.name;
            router.route({ frontendId, path }, () => {
                queueMicrotask(next);
                return this.createSocketIoConnection(socket);
            }, error => {
                if (error) {
                    next(new Error('internal error'));
                } else {
                    next(new Error('unhandled connection'));
                }
            });
        };
    }

    protected getFrontendId(socket: socket_io.Socket): string | undefined {
        const { THEIA_FRONTEND_ID } = socket.handshake.query;
        if (typeof THEIA_FRONTEND_ID === 'string') {
            return THEIA_FRONTEND_ID;
        }
    }

    protected createSocketIoConnection(socket: socket_io.Socket): SocketIoConnection {
        return new SocketIoConnection(socket);
    }
}

/**
 * @internal
 */
export class SocketIoConnection extends AbstractConnection<any> {

    state = Connection.State.OPENING;

    constructor(
        protected socket: socket_io.Socket
    ) {
        super();
        pushDisposableListener(this.disposables, socket, 'message', message => this.onMessageEmitter.fire(message));
        pushDisposableListener(this.disposables, socket, 'disconnect', reason => {
            this.setClosedAndEmit();
            this.dispose();
        });
        queueMicrotask(() => this.setOpenedAndEmit());
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
