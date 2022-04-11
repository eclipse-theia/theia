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
import { Emitter, Event } from '../event';
import { getUintType, UintType, ReadBuffer, WriteBuffer } from './message-buffer';

export class ArrayBufferWriteBuffer implements WriteBuffer {
    constructor(private buffer: ArrayBuffer = new ArrayBuffer(1024), private offset: number = 0) {
    }

    private get msg(): DataView {
        return new DataView(this.buffer);
    }

    ensureCapacity(value: number): WriteBuffer {
        let newLength = this.buffer.byteLength;
        while (newLength < this.offset + value) {
            newLength *= 2;
        }
        if (newLength !== this.buffer.byteLength) {
            const newBuffer = new ArrayBuffer(newLength);
            new Uint8Array(newBuffer).set(new Uint8Array(this.buffer));
            this.buffer = newBuffer;
        }
        return this;
    }

    writeUint8(value: number): WriteBuffer {
        this.ensureCapacity(1);
        this.msg.setUint8(this.offset++, value);
        return this;
    }

    writeUint16(value: number): WriteBuffer {
        this.ensureCapacity(2);
        this.msg.setUint16(this.offset, value);
        this.offset += 2;
        return this;
    }

    writeUint32(value: number): WriteBuffer {
        this.ensureCapacity(4);
        this.msg.setUint32(this.offset, value);
        this.offset += 4;
        return this;
    }

    writeInteger(value: number): WriteBuffer {
        const type = getUintType(value);
        this.writeUint8(type);
        switch (type) {
            case UintType.Uint8:
                this.writeUint8(value);
                return this;
            case UintType.Uint16:
                this.writeUint16(value);
                return this;
            default:
                this.writeUint32(value);
                return this;
        }
    }

    writeString(value: string): WriteBuffer {
        const encoded = this.encodeString(value);
        this.writeBytes(encoded);
        return this;
    }

    private encodeString(value: string): Uint8Array {
        return new TextEncoder().encode(value);
    }

    writeBytes(value: ArrayBuffer): WriteBuffer {
        this.writeInteger(value.byteLength);
        this.ensureCapacity(value.byteLength);
        new Uint8Array(this.buffer).set(new Uint8Array(value), this.offset);
        this.offset += value.byteLength;
        return this;
    }

    private onCommitEmitter = new Emitter<ArrayBuffer>();
    get onCommit(): Event<ArrayBuffer> {
        return this.onCommitEmitter.event;
    }

    commit(): void {
        this.onCommitEmitter.fire(this.getCurrentContents());
    }

    getCurrentContents(): ArrayBuffer {
        return this.buffer.slice(0, this.offset);

    }
}

export class ArrayBufferReadBuffer implements ReadBuffer {
    private offset: number = 0;

    constructor(private readonly buffer: ArrayBuffer, readPosition = 0) {
        this.offset = readPosition;
    }

    private get msg(): DataView {
        return new DataView(this.buffer);
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
        const result = this.msg.getInt32(this.offset);
        this.offset += 4;
        return result;
    }

    readInteger(): number {
        const type = this.readUint8();
        switch (type) {
            case UintType.Uint8:
                return this.readUint8();
            case UintType.Uint16:
                return this.readUint16();
            default:
                return this.readUint32();
        }
    }

    readString(): string {
        const len = this.readInteger();
        const result = this.decodeString(this.buffer.slice(this.offset, this.offset + len));
        this.offset += len;
        return result;
    }

    private decodeString(buf: ArrayBuffer): string {
        return new TextDecoder().decode(buf);
    }

    readBytes(): ArrayBuffer {
        const length = this.readInteger();
        const result = this.buffer.slice(this.offset, this.offset + length);
        this.offset += length;
        return result;
    }

    sliceAtCurrentPosition(): ReadBuffer {
        return new ArrayBufferReadBuffer(this.buffer, this.offset);
    }
}

/**
 * Retrieve an {@link ArrayBuffer} view for the given buffer. Some {@link Uint8Array} buffer implementations e.g node's {@link Buffer}
 * are using shared memory array buffers under the hood. Therefore we need to check the buffers `byteOffset` and `length` and slice
 * the underlying array buffer if needed.
 * @param buffer The Uint8Array or ArrayBuffer that should be converted.
 * @returns a trimmed `ArrayBuffer` representation for the given buffer.
 */
export function toArrayBuffer(buffer: Uint8Array | ArrayBuffer): ArrayBuffer {
    if (buffer instanceof ArrayBuffer) {
        return buffer;
    }
    if (buffer.byteOffset === 0 && buffer.byteLength === buffer.buffer.byteLength) {
        return buffer.buffer;
    }

    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

