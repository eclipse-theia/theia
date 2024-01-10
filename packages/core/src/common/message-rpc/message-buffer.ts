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
    writeRaw(bytes: Uint8Array): this;
    /**
     * Makes any writes to the buffer permanent, for example by sending the writes over a channel.
     * You must obtain a new write buffer after committing
     */
    commit(): void;
}

export class ForwardingWriteBuffer implements WriteBuffer {
    constructor(protected readonly underlying: WriteBuffer) {
    }

    writeUint8(byte: number): this {
        this.underlying.writeUint8(byte);
        return this;
    }

    writeUint16(value: number): this {
        this.underlying.writeUint16(value);
        return this;
    }

    writeUint32(value: number): this {
        this.underlying.writeUint32(value);
        return this;
    }

    writeLength(value: number): this {
        this.underlying.writeLength(value);
        return this;
    }

    writeString(value: string): this {
        this.underlying.writeString(value);
        return this;
    }

    writeBytes(value: Uint8Array): this {
        this.underlying.writeBytes(value);
        return this;
    }

    writeNumber(value: number): this {
        this.underlying.writeNumber(value);
        return this;
    }

    writeRaw(bytes: Uint8Array): this {
        this.underlying.writeRaw(bytes);
        return this;
    }

    commit(): void {
        this.underlying.commit();
    }
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

    /**
     * Returns a new read buffer  whose starting read position is the current read position of this buffer.
     * This is useful to create read buffers sub messages.
     * (e.g. when using a multiplexer the beginning of the message might contain some protocol overhead which should not be part
     * of the message reader that is sent to the target channel)
     */
    sliceAtReadPosition(): ReadBuffer
}
