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
import { Emitter, Event } from '../event';
import { ReadBuffer, WriteBuffer } from './message-buffer';

export class ArrrayBufferWriteBuffer implements WriteBuffer {
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

    writeByte(value: number): WriteBuffer {
        this.ensureCapacity(1);
        this.msg.setUint8(this.offset++, value);
        return this;
    }

    writeInt(value: number): WriteBuffer {
        this.ensureCapacity(4);
        this.msg.setUint32(this.offset, value);
        this.offset += 4;
        return this;
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
        this.ensureCapacity(value.byteLength + 4);
        this.writeInt(value.byteLength);
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

    constructor(private readonly buffer: ArrayBuffer) {
    }

    private get msg(): DataView {
        return new DataView(this.buffer);
    }

    readByte(): number {
        return this.msg.getUint8(this.offset++);
    }

    readInt(): number {
        const result = this.msg.getInt32(this.offset);
        this.offset += 4;
        return result;
    }

    readString(): string {
        const len = this.msg.getUint32(this.offset);
        this.offset += 4;
        const result = this.decodeString(this.buffer.slice(this.offset, this.offset + len));
        this.offset += len;
        return result;
    }

    private decodeString(buf: ArrayBuffer): string {
        return new TextDecoder().decode(buf);
    }

    readBytes(): ArrayBuffer {
        const length = this.msg.getUint32(this.offset);
        this.offset += 4;
        const result = this.buffer.slice(this.offset, this.offset + length);
        this.offset += length;
        return result;
    }
}
