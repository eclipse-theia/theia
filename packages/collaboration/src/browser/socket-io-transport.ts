// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { Socket, io } from 'socket.io-client';
import { Emitter, Event, MessageTransport, MessageTransportProvider } from 'open-collaboration-rpc';

export const SocketIoTransportProvider: MessageTransportProvider = {
    id: 'socket.io',
    createTransport: (url, headers) => {
        const socket = io(url, {
            extraHeaders: headers
        });
        const transport = new SocketIoTransport(socket);
        return transport;
    }
};

export class SocketIoTransport implements MessageTransport {

    readonly id = 'socket.io';

    private onDisconnectEmitter = new Emitter<void>();

    get onDisconnect(): Event<void> {
        return this.onDisconnectEmitter.event;
    }

    constructor(protected socket: Socket) {
        this.socket.on('disconnect', () => this.onDisconnectEmitter.fire());
    }

    write(data: ArrayBuffer): void {
        this.socket.emit('message', data);
    }

    read(cb: (data: ArrayBuffer) => void): void {
        this.socket.on('message', cb);
    }

    dispose(): void {
        this.onDisconnectEmitter.dispose();
        this.socket.close();
    }
}
