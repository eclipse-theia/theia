// *****************************************************************************
// Copyright (C) STMicroelectronics and others.
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
import { BinaryMessageCodec, EncodingError } from './message-codec';

describe('Binary Message Codec', () => {
    describe('Encode & Decode', () => {
        it('should encode object into binary message and decode the message back into the original object', () => {
            const messageCodec = new BinaryMessageCodec();
            // Construct a simple test object that covers all different value types
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
                functionArray: [() => console.log()],
                undefined: undefined,
                // eslint-disable-next-line no-null/no-null
                null: null
            };

            // Prepare the expected result. Functions array values should be encoded as empty objects,
            // null as `undefined`.
            const expected = { ...testObject, functionArray: [{}], null: undefined };
            const encoded = messageCodec.encode(testObject);

            const decoded = messageCodec.decode(encoded);

            expect(decoded).deep.equal(expected);
        });
        it('should fail with an EncodingError when trying to encode the circular object structure', () => {
            const x = new Set();
            const y = new Set();
            x.add(y);
            y.add(x);
            const codec = new BinaryMessageCodec();

            expect(() => codec.encode(x)).to.throw(EncodingError);
        });
    });
});
