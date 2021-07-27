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

import express = require('express');
import { inject, injectable } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import { Connection } from '../../common/messaging/connection';
import { ConnectionId, CONNECTION_ID_KEY, HTTP_LONG_POLLING_PATH } from '../../common/messaging/http-long-polling-protocol';
import { BackendApplicationContribution } from '../backend-application';
import { ConnectionServer, ConnectionServerContribution } from './connection-server';

export interface HttpLongPollingConnection extends Connection {
    emitMessage(message: string): void
    setSender(sender: (body: string) => Promise<boolean>): void
    clearSender(): void
    closeLocally(event: Connection.CloseEvent): void
}

@injectable()
export class HttpLongPollingServerContribution implements BackendApplicationContribution, ConnectionServerContribution {

    protected connections = new Map<ConnectionId, HttpLongPollingConnection>();

    @inject(ConnectionServer)
    protected connectionServer: ConnectionServer;

    configure(app: express.Application): void {
        app.use(HTTP_LONG_POLLING_PATH, express.Router()
            .get('/open', express.json(), (request, response) => this.handleOpen(request, response))
            .get('/poll', (request, response) => this.handlePoll(request, response))
            .post('/post', express.json(), (request, response) => this.handlePost(request, response))
            .post('/close', express.urlencoded(), (request, response) => this.handleClose(request, response))
        );
    }

    protected createConnectionId(request: express.Request, response: express.Response): ConnectionId {
        return uuidv4();
    }

    protected createHttpLongPollingConnection(): HttpLongPollingConnection {
        return new HttpLongPollingConnectionImpl();
    }

    protected async handleOpen(request: express.Request, response: express.Response): Promise<void> {
        // `request.body` must be a plain old JSON object
        // eslint-disable-next-line no-null/no-null
        if (typeof request.body !== 'object' || Array.isArray(request.body)) {
            response.sendStatus(400);
            return;
        }
        const options: object | undefined = request.body ?? undefined;
        const connectionId = this.createConnectionId(request, response);
        const connection = this.createHttpLongPollingConnection();
        this.connections.set(connectionId, connection);
        connection.onClose(() => this.connections.delete(connectionId));
        if (await this.connectionServer.accept(connection, options)) {
            response.setHeader(CONNECTION_ID_KEY, connectionId);
            response.status(200).send();
        } else {
            response.sendStatus(403);
        }
    }

    protected async handlePoll(request: express.Request, response: express.Response): Promise<void> {
        const connectionId = request.headers[CONNECTION_ID_KEY];
        if (typeof connectionId !== 'string') {
            response.sendStatus(400);
            return;
        }
        const connection = this.getConnection(connectionId);
        if (!connection) {
            response.sendStatus(404);
            return;
        }
        connection.setSender(body => new Promise(resolve => {
            // If the client received everything, we'll get 'finish' followed by 'close'.
            // If the client didn't receive everything, we'll only get 'close'.
            response.once('finish', () => resolve(true));
            response.once('close', () => resolve(false));
            response.send(body);
        }));
    }

    protected async handlePost(request: express.Request, response: express.Response): Promise<void> {
        const connectionId = request.headers[CONNECTION_ID_KEY];
        if (typeof connectionId !== 'string') {
            response.sendStatus(400);
            return;
        }
        const connection = this.getConnection(connectionId);
        if (!connection) {
            response.sendStatus(404);
            return;
        }
        if (!Array.isArray(request.body) || request.body.some(element => typeof element !== 'string')) {
            response.sendStatus(400);
            return;
        }
        response.status(200).send();
        for (const message of request.body as string[]) {
            connection.emitMessage(message);
        }
    }

    protected async handleClose(request: express.Request, response: express.Response): Promise<void> {
        const connectionId = request.body[CONNECTION_ID_KEY] as unknown;
        if (typeof connectionId !== 'string') {
            response.sendStatus(400);
            return;
        }
        const connection = this.getConnection(connectionId);
        if (!connection) {
            response.sendStatus(404);
            return;
        }
        const event = Connection.normalizeCloseEvent(request.body);
        connection.closeLocally(event);
    }

    protected getConnection(connectionId: string): HttpLongPollingConnection | undefined {
        return this.connections.get(connectionId);
    }
}

export class HttpLongPollingConnectionImpl extends Connection.AbstractBase implements HttpLongPollingConnection {

    state = Connection.State.Open;

    protected pendingMessages: string[] = [];
    protected pendingTimeout?: NodeJS.Timeout;
    protected sender?: (message: string) => void;

    sendMessage(message: string): void {
        Connection.ensureOpened(this);
        this.pendingMessages.push(message);
        this.scheduleSend();
    }

    close(event: Connection.CloseEvent): void {
        Connection.ensureNotClosing(this);
        Connection.ensureNotClosed(this);
    }

    closeLocally(event: Connection.CloseEvent): void {
        Connection.ensureNotClosing(this);
        Connection.ensureNotClosed(this);
        event = Connection.normalizeCloseEvent(event);
        this.state = Connection.State.Closed;
        this.onCloseEmitter.fire(event);
    }

    emitMessage(message: string): void {
        this.onMessageEmitter.fire(message);
    }

    setSender(sender: (message: string) => Promise<boolean>): void {
        this.sender = sender;
        this.sendPendingMessages();
    }

    clearSender(): void {
        this.sender = undefined;
    }

    protected sendPendingMessages(): void {
        const { sender } = this;
        if (sender) {
            this.clearSender();
            sender(JSON.stringify(this.pendingMessages));
            this.pendingMessages = [];
        }
    }

    protected scheduleSend(): void {
        if (!this.pendingTimeout) {
            // Both typings for the browser and Node are loaded at the same time,
            // and TypeScript is getting confused here:
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.pendingTimeout = setTimeout(() => this.sendPendingMessages()) as any;
        }
    }
}
