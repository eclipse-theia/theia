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
import { Uint8ArrayWriteBuffer } from '../../common/message-rpc/uint8-array-message-buffer';
import { BinaryMessagePipe } from './binary-message-pipe';

describe('BinaryMessagePipe', () => {
    const payload = Buffer.alloc(64, 0x41);
    const headerLength = 4 + BinaryMessagePipe.MESSAGE_START_IDENTIFIER.length + 4;
    let stream: PassThrough;
    let pipe: BinaryMessagePipe;
    let messages: Buffer[];
    let frame: Buffer;

    beforeEach(() => {
        stream = new PassThrough();
        pipe = new BinaryMessagePipe(stream);
        messages = [];
        frame = encodeFrame(payload);
        pipe.onMessage(message => messages.push(Buffer.from(message)));
    });

    afterEach(() => {
        pipe.dispose();
        stream.destroy();
    });

    it('accumulates consecutive chunks that are shorter than the header', () => {
        stream.emit('data', frame.subarray(0, 10));
        stream.emit('data', frame.subarray(10, headerLength));
        stream.emit('data', frame.subarray(headerLength));

        expect(messages).to.deep.equal([payload]);
    });

    it('receives the original payload when the header is split between chunks', () => {
        stream.emit('data', frame.subarray(0, 10));
        stream.emit('data', frame.subarray(10));

        expect(messages).to.deep.equal([payload]);
    });

    it('preserves the next frame in the same chunk after a partial header', () => {
        const nextPayload = Buffer.from('next');
        stream.emit('data', frame.subarray(0, 10));
        stream.emit('data', Buffer.concat([frame.subarray(10), encodeFrame(nextPayload)]));

        expect(messages).to.deep.equal([payload, nextPayload]);
    });
});

function encodeFrame(payload: Uint8Array): Buffer {
    const writer = new Uint8ArrayWriteBuffer()
        .writeString(BinaryMessagePipe.MESSAGE_START_IDENTIFIER)
        .writeUint32(payload.length)
        .writeRaw(payload);
    const frame = Buffer.from(writer.getCurrentContents());
    writer.dispose();
    return frame;
}
