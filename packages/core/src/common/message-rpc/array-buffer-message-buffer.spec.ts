/********************************************************************************
 * Copyright (C) 2021 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
import { expect } from 'chai';
import { ArrayBufferReadBuffer, ArrrayBufferWriteBuffer } from './array-buffer-message-buffer';

describe('array message buffer tests', () => {
    it('basic read write test', () => {
        const buffer = new ArrayBuffer(1024);
        const writer = new ArrrayBufferWriteBuffer(buffer);

        writer.writeByte(8);
        writer.writeInt(10000);
        writer.writeBytes(new Uint8Array([1, 2, 3, 4]));
        writer.writeString('this is a string');
        writer.writeString('another string');
        writer.commit();

        const written = writer.getCurrentContents();

        const reader = new ArrayBufferReadBuffer(written);

        expect(reader.readByte()).equal(8);
        expect(reader.readInt()).equal(10000);
        expect(reader.readBytes()).deep.equal(new Uint8Array([1, 2, 3, 4]).buffer);
        expect(reader.readString()).equal('this is a string');
        expect(reader.readString()).equal('another string');
    });
});
