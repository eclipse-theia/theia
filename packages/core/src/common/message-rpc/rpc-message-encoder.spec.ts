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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from './uint8-array-message-buffer';
import { EncodingError, RpcMessageDecoder, RpcMessageEncoder } from './rpc-message-encoder';

describe('PPC Message Codex', () => {
    describe('RPC Message Encoder & Decoder', () => {
        it('should encode object into binary message and decode the message back into the original object', () => {
            const buffer = new Uint8Array(1024);
            const writer = new Uint8ArrayWriteBuffer(buffer);

            const encoder = new RpcMessageEncoder();
            const jsonMangled = JSON.parse(JSON.stringify(encoder));
            // The RpcMessageEncoder can decode/encode collections, whereas JSON.parse can't. => We have to manually restore the set
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            jsonMangled.registeredTags = (encoder as any).registeredTags;

            encoder.writeTypedValue(writer, encoder, new WeakSet());

            const written = writer.getCurrentContents();

            const reader = new Uint8ArrayReadBuffer(written);

            const decoder = new RpcMessageDecoder();
            const decoded = decoder.readTypedValue(reader);

            expect(decoded).deep.equal(jsonMangled);
        });
        it('should fail with an EncodingError when trying to encode the object ', () => {
            const x = new Set();
            const y = new Set();
            x.add(y);
            y.add(x);
            const encoder = new RpcMessageEncoder();

            const writer = new Uint8ArrayWriteBuffer();
            expect(() => encoder.writeTypedValue(writer, x, new WeakSet())).to.throw(EncodingError);
        });
    });
});
