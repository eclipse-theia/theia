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
import { Disposable } from '../disposable';
import { Emitter, Event } from '../event';
import { ReadBuffer, WriteBuffer } from './message-buffer';

/**
 * The default {@link WriteBuffer} implementation. Uses a {@link Uint8Array} for buffering.
 * The {@link Uint8ArrayWriteBuffer.onCommit} hook can be used to rect to on-commit events.
 * After the {@link Uint8ArrayWriteBuffer.commit} method has been called the buffer is disposed
 * and can no longer be used for writing data. If the writer buffer is no longer needed but the message
 * has not been committed yet it has to be disposed manually.
 */
export class Uint8ArrayWriteBuffer implements WriteBuffer, Disposable {

    private encoder = new TextEncoder();
    private msg: DataView;
    private isDisposed = false;
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

    writeRaw(bytes: Uint8Array): this {
        this.ensureCapacity(bytes.byteLength);
        this.buffer.set(bytes, this.offset);
        this.offset += bytes.byteLength;
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

    private onCommitEmitter = new Emitter<Uint8Array>();
    get onCommit(): Event<Uint8Array> {
        return this.onCommitEmitter.event;
    }

    commit(): void {
        if (this.isDisposed) {
            throw new Error("Could not invoke 'commit'. The WriteBuffer is already disposed.");
        }
        this.onCommitEmitter.fire(this.getCurrentContents());
        this.dispose();
    }

    getCurrentContents(): Uint8Array {
        return this.buffer.slice(this.buffer.byteOffset, this.offset);
    }

    dispose(): void {
        if (!this.isDisposed) {
            this.onCommitEmitter.dispose();
            this.isDisposed = true;
        }
    }

}
/**
 * The default {@link ReadBuffer} implementation. Uses a {@link Uint8Array} for buffering.
 * Is for single message read. A message can only be read once.
 */
export class Uint8ArrayReadBuffer implements ReadBuffer {
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

    sliceAtReadPosition(): ReadBuffer {
        const sliceOffset = this.offset - this.buffer.byteOffset;
        return new Uint8ArrayReadBuffer(this.buffer, sliceOffset);
    }
}
