/* eslint-disable @theia/runtime-import-check */
// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import * as http from 'http';
import * as https from 'https';
import { AddressInfo } from 'net';
import { servicesPath } from '../../../common';
import { WebSocketConnectionSource } from '../../../browser/messaging/ws-connection-source';
import { Container, inject } from 'inversify';
import { RemoteConnectionProvider, ServiceConnectionProvider } from '../../../browser/messaging/service-connection-provider';
import { messagingFrontendModule } from '../../../browser/messaging/messaging-frontend-module';
import { Socket, io } from 'socket.io-client';

const websocketUrl = Symbol('testWebsocketUrl');
class TestWebsocketConnectionSource extends WebSocketConnectionSource {
    @inject(websocketUrl)
    readonly websocketUrl: string;

    protected override createWebSocketUrl(path: string): string {
        return this.websocketUrl;
    }

    protected override createWebSocket(url: string): Socket {
        return io(url);
    }
}

export class TestWebSocketChannelSetup {
    public readonly connectionProvider: ServiceConnectionProvider;

    constructor({ server, path }: {
        server: http.Server | https.Server,
        path: string
    }) {
        const address = (server.address() as AddressInfo);
        const url = `ws://${address.address}:${address.port}${servicesPath}`;
        this.connectionProvider = this.createConnectionProvider(url);
    }

    protected createConnectionProvider(socketUrl: string): ServiceConnectionProvider {
        const container = new Container();
        container.bind(websocketUrl).toConstantValue(socketUrl);
        container.load(messagingFrontendModule);
        container.rebind(WebSocketConnectionSource).to(TestWebsocketConnectionSource);
        return container.get(RemoteConnectionProvider);
    }
}
