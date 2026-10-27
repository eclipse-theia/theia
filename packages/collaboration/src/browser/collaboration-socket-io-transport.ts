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

import { Emitter, Event } from '@theia/core';
import { MessageTransport, MessageTransportProvider, SocketIoTransport, SocketIoTransportProvider } from 'open-collaboration-protocol';
import { io, Socket } from 'socket.io-client';

/**
 * A transport that reports when the server closes the connection.
 */
export interface ServerCloseAwareTransport extends MessageTransport {
    /**
     * Fires as soon as the server closes the connection.
     */
    readonly onServerClose: Event<void>;
}

export namespace ServerCloseAwareTransport {
    export function is(transport?: MessageTransport): transport is ServerCloseAwareTransport {
        return !!transport && 'onServerClose' in transport;
    }
}

/**
 * The socket.io transport of `open-collaboration-protocol`, plus {@link ServerCloseAwareTransport.onServerClose}.
 * Its `onDisconnect` waits 30 s for a reconnect before it fires, also when the server closed the connection on purpose.
 */
export class CollaborationSocketIoTransport extends SocketIoTransport implements ServerCloseAwareTransport {

    protected readonly onServerCloseEmitter = new Emitter<void>();

    get onServerClose(): Event<void> {
        return this.onServerCloseEmitter.event;
    }

    constructor(socket: Socket) {
        // `open-collaboration-protocol` is typed against the ESM build of socket.io-client, this file against the CommonJS one.
        super(socket as unknown as ConstructorParameters<typeof SocketIoTransport>[0]);
        socket.on('disconnect', reason => {
            if (reason === 'io server disconnect') {
                this.onServerCloseEmitter.fire();
            }
        });
    }

    override dispose(): void {
        this.onServerCloseEmitter.dispose();
        super.dispose();
    }
}

export const CollaborationSocketIoTransportProvider: MessageTransportProvider = {
    id: SocketIoTransportProvider.id,
    createTransport: (url, headers) => new CollaborationSocketIoTransport(io(url, { extraHeaders: headers }))
};
