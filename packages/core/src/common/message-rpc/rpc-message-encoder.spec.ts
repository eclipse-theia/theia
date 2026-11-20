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
import { MsgPackExtensionManager } from './msg-pack-extension-manager.js';
import {
    EncodingError, MsgPackMessageDecoder, MsgPackMessageEncoder, ResponseError, registerMsgPackExtensions
} from './rpc-message-encoder.js';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from './uint8-array-message-buffer.js';

describe('PPC Message Encoder & Decoder', () => {
    describe('MsgPack  Encoder & Decoder', () => {
        before(() => {
            // The extensions are registered globally once per process, e.g. by importing `message-rpc/index`
            if (!MsgPackExtensionManager.getInstance().getExtension(1)) {
                registerMsgPackExtensions();
            }
        });

        function roundTrip<T>(value: T): T {
            const writer = new Uint8ArrayWriteBuffer();
            new MsgPackMessageEncoder().encode(writer, value);
            return new MsgPackMessageDecoder().decode(new Uint8ArrayReadBuffer(writer.getCurrentContents()));
        }

        it('should keep the name, message and code of an error', () => {
            const error = Object.assign(new Error('boom'), { code: 'EACCES' });
            error.name = 'SystemError';

            const decoded = roundTrip(error);

            expect(decoded).to.be.instanceOf(Error);
            expect(decoded.name).to.equal('SystemError');
            expect(decoded.message).to.equal('boom');
            expect(decoded.code).to.equal('EACCES');
        });

        it('should decode an error without a code as before', () => {
            const decoded = roundTrip(new Error('plain'));

            expect(decoded).to.be.instanceOf(Error);
            expect('code' in decoded).to.be.false;
        });

        it('should keep a response error with its code and data', () => {
            const decoded = roundTrip(new ResponseError(42, 'response', { detail: true }));

            expect(decoded).to.be.instanceOf(ResponseError);
            expect(decoded.code).to.equal(42);
            expect(decoded.message).to.equal('response');
            expect(decoded.data).to.deep.equal({ detail: true });
        });

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
