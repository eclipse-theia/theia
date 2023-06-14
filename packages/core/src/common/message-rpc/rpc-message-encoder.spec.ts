// *****************************************************************************
// Copyright (C) 2021 Red Hat, Inc. and others.
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
import {
    EncodingError, MsgPackMessageDecoder, MsgPackMessageEncoder
} from './rpc-message-encoder';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from './uint8-array-message-buffer';

describe('PPC Message Encoder & Decoder', () => {
    describe('MsgPack  Encoder & Decoder', () => {
        it('should encode object into binary message and decode the message back into the original object', () => {
            const buffer = new Uint8Array(1024);
            const writer = new Uint8ArrayWriteBuffer(buffer);
            const testObject = {
                string: 'string',
                boolean: true,
                integer: 5,
                float: 14.5,
                array: ['1', 2, { three: 'three' }],
                set: new Set([1, 2, 3]),
                map: new Map([[1, 1], [2, 2], [3, 3]]),
                buffer: new TextEncoder().encode('ThisIsAUint8Array'),
                object: { foo: 'bar', baz: true },
                undefined: undefined,
                // eslint-disable-next-line no-null/no-null
                null: null
            };

            const encoder = new MsgPackMessageEncoder();
            encoder.encode(writer, testObject);
            const written = writer.getCurrentContents();

            const reader = new Uint8ArrayReadBuffer(written);

            const decoder = new MsgPackMessageDecoder();
            const decoded = decoder.decode(reader);

            expect(decoded).deep.equal(testObject);
        });
        it('should fail with an EncodingError when trying to encode the object ', () => {
            const x = new Set();
            const y = new Set();
            x.add(y);
            y.add(x);

            const writer = new Uint8ArrayWriteBuffer();
            const encoder = new MsgPackMessageEncoder();
            expect(() => encoder.encode(writer, x)).to.throw(EncodingError);
        });
    });
});
