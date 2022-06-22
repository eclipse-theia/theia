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

/**
 * A buffer maintaining a write position capable of writing primitive values
 */
export interface WriteBuffer {
    writeUint8(byte: number): this
    writeUint16(value: number): this
    writeUint32(value: number): this
    writeString(value: string): this
    writeBytes(value: Uint8Array): this
    writeNumber(value: number): this
    writeLength(value: number): this
    getCurrentContents(): Uint8Array;

}

/**
 * A buffer maintaining a read position in a buffer containing a received message capable of
 * reading primitive values.
 */
export interface ReadBuffer {
    readUint8(): number;
    readUint16(): number;
    readUint32(): number;
    readString(): string;
    readNumber(): number,
    readLength(): number,
    readBytes(): Uint8Array;
}

/**
 * The default {@link WriteBuffer} implementation. Uses a {@link Uint8Array} for buffering.
 */
export class WriteBufferImpl implements WriteBuffer {

    private encoder = new TextEncoder();
    private msg: DataView;
    private offset: number;

    constructor(private buffer: Uint8Array = new Uint8Array(1024), writePosition: number = 0) {
        this.offset = buffer.byteOffset + writePosition;
        this.msg = new DataView(buffer.buffer);
    }

    ensureCapacity(value: number): this {
        let newLength = this.buffer.byteLength;
        while (newLength < this.offset + value) {
            newLength *= 2;
        }
        if (newLength !== this.buffer.byteLength) {
            const newBuffer = new Uint8Array(newLength);
            newBuffer.set(this.buffer);
            this.buffer = newBuffer;
            this.msg = new DataView(this.buffer.buffer);
        }
        return this;
    }

    writeLength(length: number): this {
        if (length < 0 || (length % 1) !== 0) {
            throw new Error(`Could not write the given length value. '${length}' is not an integer >= 0`);
        }
        if (length < 127) {
            this.writeUint8(length);
        } else {
            this.writeUint8(128 + (length & 127));
            this.writeLength(length >> 7);
        }
        return this;
    }

    writeNumber(value: number): this {
        this.ensureCapacity(8);
        this.msg.setFloat64(this.offset, value);
        this.offset += 8;
        return this;
    }

    writeUint8(value: number): this {
        this.ensureCapacity(1);
        this.buffer[this.offset++] = value;
        return this;
    }

    writeUint16(value: number): this {
        this.ensureCapacity(2);
        this.msg.setUint16(this.offset, value);
        this.offset += 2;
        return this;
    }

    writeUint32(value: number): this {
        this.ensureCapacity(4);
        this.msg.setUint32(this.offset, value);
        this.offset += 4;
        return this;
    }

    writeString(value: string): this {
        this.ensureCapacity(4 * value.length);
        const result = this.encoder.encodeInto(value, this.buffer.subarray(this.offset + 4));
        this.msg.setUint32(this.offset, result.written!);
        this.offset += 4 + result.written!;
        return this;
    }

    writeBytes(value: Uint8Array): this {
        this.writeLength(value.byteLength);
        this.ensureCapacity(value.length);
        this.buffer.set(value, this.offset);
        this.offset += value.length;
        return this;
    }

    getCurrentContents(): Uint8Array {
        return this.buffer.slice(this.buffer.byteOffset, this.offset);
    }
}

/**
 * The default {@link ReadBuffer} implementation. Uses a {@link Uint8Array} for buffering.
 * Is for single message read. A message can only be read once.
 */
export class ReadBufferImpl implements ReadBuffer {
    private offset: number = 0;
    private msg: DataView;
    private decoder = new TextDecoder();

    constructor(private readonly buffer: Uint8Array, readPosition = 0) {
        this.offset = buffer.byteOffset + readPosition;
        this.msg = new DataView(buffer.buffer);
    }

    readUint8(): number {
        return this.msg.getUint8(this.offset++);
    }

    readUint16(): number {
        const result = this.msg.getUint16(this.offset);
        this.offset += 2;
        return result;
    }

    readUint32(): number {
        const result = this.msg.getUint32(this.offset);
        this.offset += 4;
        return result;
    }

    readLength(): number {
        let shift = 0;
        let byte = this.readUint8();
        let value = (byte & 127) << shift;
        while (byte > 127) {
            shift += 7;
            byte = this.readUint8();
            value = value + ((byte & 127) << shift);
        }
        return value;
    }

    readNumber(): number {
        const result = this.msg.getFloat64(this.offset);
        this.offset += 8;
        return result;
    }

    readString(): string {
        const len = this.readUint32();
        const sliceOffset = this.offset - this.buffer.byteOffset;
        const result = this.decodeString(this.buffer.slice(sliceOffset, sliceOffset + len));
        this.offset += len;
        return result;
    }

    private decodeString(buf: Uint8Array): string {
        return this.decoder.decode(buf);
    }

    readBytes(): Uint8Array {
        const length = this.readLength();
        const sliceOffset = this.offset - this.buffer.byteOffset;
        const result = this.buffer.slice(sliceOffset, sliceOffset + length);
        this.offset += length;
        return result;
    }
}
