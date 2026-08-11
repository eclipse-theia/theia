// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { uint8ArrayToBase64, base64ToUint8Array } from './lm-tool-protocol';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';

describe('lm-tool-protocol base64 helpers', () => {

    describe('uint8ArrayToBase64', () => {
        it('should encode an empty array to an empty string', () => {
            expect(uint8ArrayToBase64(new Uint8Array([]))).to.equal('');
        });

        it('should encode ASCII bytes to expected base64', () => {
            const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
            expect(uint8ArrayToBase64(data)).to.equal('SGVsbG8=');
        });

        it('should encode binary data with byte 0 and 255', () => {
            const data = new Uint8Array([0, 127, 128, 255]);
            const base64 = uint8ArrayToBase64(data);
            expect(base64).to.equal(btoa('\x00\x7f\x80\xff'));
        });
    });

    describe('base64ToUint8Array', () => {
        it('should decode an empty string to an empty Uint8Array', () => {
            const result = base64ToUint8Array('');
            expect(result).to.be.instanceOf(Uint8Array);
            expect(result.length).to.equal(0);
        });

        it('should decode known base64 to expected bytes', () => {
            const result = base64ToUint8Array('SGVsbG8=');
            expect(Array.from(result)).to.deep.equal([72, 101, 108, 108, 111]);
        });

        it('should round-trip binary data', () => {
            const original = new Uint8Array([0, 1, 127, 128, 255]);
            const base64 = uint8ArrayToBase64(original);
            const decoded = base64ToUint8Array(base64);
            expect(Array.from(decoded)).to.deep.equal(Array.from(original));
        });
    });

    describe('round-trip symmetry', () => {
        it('should round-trip ASCII text', () => {
            const text = 'Hello World';
            const encoded = uint8ArrayToBase64(BinaryBuffer.fromString(text).buffer);
            const decoded = BinaryBuffer.wrap(base64ToUint8Array(encoded)).toString();
            expect(decoded).to.equal(text);
        });

        it('should round-trip UTF-8 text', () => {
            const text = 'café 日本語 🎉';
            const encoded = uint8ArrayToBase64(BinaryBuffer.fromString(text).buffer);
            const decoded = BinaryBuffer.wrap(base64ToUint8Array(encoded)).toString();
            expect(decoded).to.equal(text);
        });

        it('should round-trip binary data', () => {
            const original = new Uint8Array([0, 1, 127, 128, 255]);
            const base64 = uint8ArrayToBase64(original);
            const result = base64ToUint8Array(base64);
            expect(Array.from(result)).to.deep.equal(Array.from(original));
        });

        it('should round-trip JSON text with UTF-8 characters', () => {
            const text = '{"key":"données"}';
            const encoded = uint8ArrayToBase64(BinaryBuffer.fromString(text).buffer);
            const decoded = BinaryBuffer.wrap(base64ToUint8Array(encoded)).toString();
            expect(decoded).to.equal(text);
        });
    });
});
