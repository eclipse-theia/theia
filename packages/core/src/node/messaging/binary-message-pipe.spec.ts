// *****************************************************************************
// Copyright (C) 2026 Ivan Baksheev and others.
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
import { PassThrough } from 'stream';
import { BinaryMessagePipe } from './binary-message-pipe';

class TestBinaryMessagePipe extends BinaryMessagePipe {
    override encodeMessageStart(message: Uint8Array): Uint8Array {
        return super.encodeMessageStart(message);
    }

    override get messageStartByteLength(): number {
        return super.messageStartByteLength;
    }
}

describe('BinaryMessagePipe', () => {
    const payload = Buffer.alloc(64, 0x41);
    let headerLength: number;
    let headerSplit: number;
    let stream: PassThrough;
    let pipe: TestBinaryMessagePipe;
    let messages: Buffer[];
    let frame: Buffer;

    beforeEach(() => {
        stream = new PassThrough();
        pipe = new TestBinaryMessagePipe(stream);
        headerLength = pipe.messageStartByteLength;
        headerSplit = Math.floor(headerLength / 2);
        messages = [];
        frame = encodeFrame(payload);
        pipe.onMessage(message => messages.push(Buffer.from(message)));
    });

    afterEach(() => {
        pipe.dispose();
        stream.destroy();
    });

    it('accumulates consecutive chunks that are shorter than the header', () => {
        stream.emit('data', frame.subarray(0, headerSplit));
        stream.emit('data', frame.subarray(headerSplit, headerLength));
        stream.emit('data', frame.subarray(headerLength));

        expect(messages).to.deep.equal([payload]);
    });

    it('receives the original payload when the header is split between chunks', () => {
        stream.emit('data', frame.subarray(0, headerSplit));
        stream.emit('data', frame.subarray(headerSplit));

        expect(messages).to.deep.equal([payload]);
    });

    it('preserves the next frame in the same chunk after a partial header', () => {
        const nextPayload = Buffer.from('next');
        stream.emit('data', frame.subarray(0, headerSplit));
        stream.emit('data', Buffer.concat([frame.subarray(headerSplit), encodeFrame(nextPayload)]));

        expect(messages).to.deep.equal([payload, nextPayload]);
    });

    function encodeFrame(message: Uint8Array): Buffer {
        return Buffer.concat([Buffer.from(pipe.encodeMessageStart(message)), Buffer.from(message)]);
    }
});
