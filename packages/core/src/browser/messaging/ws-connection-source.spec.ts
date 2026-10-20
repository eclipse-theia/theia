// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

import * as chai from 'chai';
import { Socket } from 'socket.io-client';
import { WebSocketConnectionSource } from './ws-connection-source';

const expect = chai.expect;

type Listener = (...args: unknown[]) => void;

/**
 * A socket that records its listeners so that the test can raise its events, with the transport options
 * of a socket created by {@link WebSocketConnectionSource.createWebSocket}.
 */
class FakeSocket {
    readonly listeners = new Map<string, Listener[]>();
    readonly io = {
        opts: { transports: ['websocket', 'polling'] as string[] | undefined },
        on: (event: string, listener: Listener) => this.on(event, listener)
    };
    on(event: string, listener: Listener): this {
        this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
        return this;
    }
    connect(): void { }
    emit(event: string, ...args: unknown[]): void {
        this.listeners.get(event)?.forEach(listener => listener(...args));
    }
}

class TestConnectionSource extends WebSocketConnectionSource {
    readonly socketImpl = new FakeSocket();
    protected override createWebSocketUrl(): string {
        return 'ws://localhost:3000/services';
    }
    protected override createWebSocket(): Socket {
        return this.socketImpl as unknown as Socket;
    }
    protected override handleSocketConnected(): void {
        // no channel negotiation in this test
    }
}

describe('WebSocketConnectionSource: transport fallback', () => {

    let source: TestConnectionSource;
    let socket: FakeSocket;

    beforeEach(() => {
        source = new TestConnectionSource();
        source.openSocket();
        socket = source.socketImpl;
    });

    it('tries the WebSocket first', () => {
        expect(socket.io.opts.transports).to.deep.equal(['websocket', 'polling']);
    });

    it('leaves the transport order to the client once connecting failed before it ever succeeded', () => {
        socket.emit('connect_error', new Error('timeout'));
        expect(socket.io.opts.transports).to.equal(undefined);
    });

    it('leaves the transport order to the client when a reconnection is attempted before the first connection', () => {
        socket.emit('reconnect_attempt', 1);
        expect(socket.io.opts.transports).to.equal(undefined);
    });

    it('keeps the WebSocket first when a connection fails after it had succeeded once', () => {
        socket.emit('connect');
        socket.emit('connect_error', new Error('transport close'));
        socket.emit('reconnect_attempt', 1);
        expect(socket.io.opts.transports).to.deep.equal(['websocket', 'polling']);
    });
});
