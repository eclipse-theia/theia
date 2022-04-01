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
import { ArrayBufferReadBuffer, ArrayBufferWriteBuffer } from './array-buffer-message-buffer';
import { RpcMessageDecoder, RpcMessageEncoder } from './rpc-message-encoder';

describe('message buffer test', () => {
    it('encode object', () => {
        const buffer = new ArrayBuffer(1024);
        const writer = new ArrayBufferWriteBuffer(buffer);

        const encoder = new RpcMessageEncoder();
        const jsonMangled = JSON.parse(JSON.stringify(encoder));

        encoder.writeTypedValue(writer, encoder);

        const written = writer.getCurrentContents();

        const reader = new ArrayBufferReadBuffer(written);

        const decoder = new RpcMessageDecoder();
        const decoded = decoder.readTypedValue(reader);

        expect(decoded).deep.equal(jsonMangled);
    });
});
