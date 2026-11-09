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
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '../message-rpc/uint8-array-message-buffer.js';
import { SocketWriteBuffer } from './socket-write-buffer.js';
import { WebSocket } from './web-socket-channel.js';

function encode(text: string): Uint8Array {
    const buffer = new Uint8ArrayWriteBuffer();
    buffer.writeString(text);
    return buffer.getCurrentContents();
}

function recordingSocket(): { socket: WebSocket, sent: string[] } {
    const sent: string[] = [];
    const socket = { send: (data: Uint8Array) => sent.push(new Uint8ArrayReadBuffer(data).readString()) } as unknown as WebSocket;
    return { socket, sent };
}

describe('SocketWriteBuffer', () => {

    it('sends each buffered message as its own socket message', () => {
        const buffer = new SocketWriteBuffer();
        ['one', 'two', 'three'].forEach(text => buffer.buffer(encode(text)));
        const { socket, sent } = recordingSocket();

        buffer.flush(socket);

        expect(sent).to.deep.equal(['one', 'two', 'three']);
    });

    it('sends nothing again on the next flush', () => {
        const buffer = new SocketWriteBuffer();
        buffer.buffer(encode('one'));
        const { socket, sent } = recordingSocket();

        buffer.flush(socket);
        buffer.buffer(encode('two'));
        buffer.flush(socket);

        expect(sent).to.deep.equal(['one', 'two']);
    });

    it('refuses a message that would take it past its size limit until drained', () => {
        const buffer = new SocketWriteBuffer();
        buffer.buffer(new Uint8Array(100 * 1024 - 1));

        expect(() => buffer.buffer(new Uint8Array(2))).to.throw('Max disconnected buffer size exceeded');
        buffer.drain();
        expect(() => buffer.buffer(new Uint8Array(100 * 1024))).to.not.throw();
    });
});
