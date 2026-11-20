// *****************************************************************************
// Copyright (C) 2026 CodeSignal and others.
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
// *****************************************************************************

import { expect } from 'chai';
import * as http from 'http';
import { AddressInfo } from 'net';
import { Container } from 'inversify';
import { Server, Socket as ServerSocket } from 'socket.io';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { ILogger } from '../../common/index.js';
import { Channel } from '../../common/message-rpc/channel.js';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '../../common/message-rpc/uint8-array-message-buffer.js';
import { ConnectionManagementMessages } from '../../common/messaging/connection-management.js';
import { SocketWriteBuffer } from '../../common/messaging/socket-write-buffer.js';
import { timeout } from '../../common/promise-util.js';
import { MockLogger } from '../../common/test/mock-logger.js';
import { MessagingContainer } from './default-messaging-service.js';
import { WebsocketEndpoint } from './websocket-endpoint.js';
import { ReconnectableSocketChannel, WebsocketFrontendConnectionService } from './websocket-frontend-connection-service.js';

const FRONTEND_ID = 'frontend-1';
const CLOSE_TIMEOUT_MS = 300;

class TestConnectionService extends WebsocketFrontendConnectionService {
    readonly channels: Channel[] = [];

    accept(socket: ServerSocket): void {
        this.handleConnection(socket, channel => this.channels.push(channel));
    }
}

function encode(text: string): Uint8Array {
    const buffer = new Uint8ArrayWriteBuffer();
    buffer.writeString(text);
    return buffer.getCurrentContents();
}

describe('WebsocketFrontendConnectionService', () => {
    let httpServer: http.Server;
    let ioServer: Server;
    let url: string;
    let service: TestConnectionService;
    let serverSockets: ServerSocket[];
    let clients: ClientSocket[];
    let savedTimeout: string | undefined;

    beforeEach(async () => {
        savedTimeout = process.env.FRONTEND_CONNECTION_TIMEOUT;
        process.env.FRONTEND_CONNECTION_TIMEOUT = String(CLOSE_TIMEOUT_MS);
        const container = new Container();
        container.bind(MessagingContainer).toConstantValue(container);
        container.bind(ILogger).to(MockLogger);
        container.bind(WebsocketEndpoint).toConstantValue(new WebsocketEndpoint());
        container.bind(SocketWriteBuffer).toSelf();
        container.bind(ReconnectableSocketChannel).toSelf();
        container.bind(TestConnectionService).toSelf().inSingletonScope();
        service = container.get(TestConnectionService);

        serverSockets = [];
        clients = [];
        httpServer = http.createServer();
        ioServer = new Server(httpServer);
        ioServer.on('connection', socket => {
            serverSockets.push(socket);
            service.accept(socket);
        });
        await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve));
        url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
    });

    afterEach(async () => {
        clients.forEach(client => client.disconnect());
        await timeout(CLOSE_TIMEOUT_MS * 2);
        await new Promise<void>(resolve => ioServer.close(() => resolve()));
        if (savedTimeout === undefined) {
            delete process.env.FRONTEND_CONNECTION_TIMEOUT;
        } else {
            process.env.FRONTEND_CONNECTION_TIMEOUT = savedTimeout;
        }
    });

    async function connect(message: string): Promise<{ client: ClientSocket, received: string[] }> {
        const client = io(url, { transports: ['websocket'], reconnection: false });
        clients.push(client);
        await new Promise<void>(resolve => client.once('connect', () => resolve()));
        const received: string[] = [];
        client.on('message', (data: Uint8Array) => received.push(new Uint8ArrayReadBuffer(new Uint8Array(data)).readString()));
        const answered = new Promise(resolve => client.once(message, resolve));
        client.emit(message, FRONTEND_ID);
        await answered;
        return { client, received };
    }

    async function closeServerSide(index: number): Promise<void> {
        const socket = serverSockets[index];
        const closed = new Promise(resolve => socket.once('disconnect', resolve));
        socket.disconnect(true);
        await closed;
    }

    it("keeps the channel on the new socket when the old socket's disconnect arrives after a reconnect", async () => {
        await connect(ConnectionManagementMessages.INITIAL_CONNECT);
        const channel = service.channels[0];
        let closed = false;
        channel.onClose(() => closed = true);
        const backendReceived: string[] = [];
        channel.onMessage(read => backendReceived.push(read().readString()));

        const fresh = await connect(ConnectionManagementMessages.RECONNECT);
        await closeServerSide(0);
        channel.getWriteBuffer().writeString('to frontend').commit();
        fresh.client.send(encode('to backend'));
        await timeout(CLOSE_TIMEOUT_MS * 2);

        expect(fresh.received).to.deep.equal(['to frontend']);
        expect(backendReceived).to.deep.equal(['to backend']);
        expect(closed).to.be.false;
    });

    it('keeps the connection a front end opened again when its first socket closes later', async () => {
        await connect(ConnectionManagementMessages.INITIAL_CONNECT);
        const again = await connect(ConnectionManagementMessages.INITIAL_CONNECT);
        const channel = service.channels[1];
        let closed = false;
        channel.onClose(() => closed = true);

        await closeServerSide(0);
        channel.getWriteBuffer().writeString('to frontend').commit();
        await timeout(CLOSE_TIMEOUT_MS * 2);

        expect(again.received).to.deep.equal(['to frontend']);
        expect(closed).to.be.false;
    });

    it('closes the channel when its current socket disconnects and the front end does not come back', async () => {
        await connect(ConnectionManagementMessages.INITIAL_CONNECT);
        const channel = service.channels[0];
        const closed = new Promise(resolve => channel.onClose(resolve));
        await connect(ConnectionManagementMessages.RECONNECT);

        await closeServerSide(1);

        await closed;
    });
});
