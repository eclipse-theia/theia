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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as http from 'http';
import * as https from 'https';
import { AddressInfo } from 'net';
import { io } from 'socket.io-client';
import { toArrayBuffer } from '../../../common/message-rpc/array-buffer-message-buffer';
import { IWebSocket, WebSocketChannel, WebSocketMainChannel } from '../../../common/messaging/web-socket-channel';

export class TestWebSocketChannel extends WebSocketMainChannel {

    constructor({ server, path }: {
        server: http.Server | https.Server,
        path: string
    }) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        super(createSocket(server));

    }
}

function createSocket(server: http.Server): IWebSocket {
    const socket = io(`ws://localhost:${(server.address() as AddressInfo).port}${WebSocketChannel.wsPath}`);
    return {
        close: () => socket.disconnect(),
        isConnected: () => socket.connected,
        onClose: cb => socket.on('disconnect', () => cb()),
        onError: cb => socket.on('error', cb),
        onMessage: cb => socket.on('message', data => cb(toArrayBuffer(data))),
        send: message => socket.emit('message', message)
    };
}
