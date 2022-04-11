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
    writeUint8(byte: number): WriteBuffer
    writeUint16(value: number): WriteBuffer
    writeUint32(value: number): WriteBuffer;
    writeString(value: string): WriteBuffer;
    writeBytes(value: ArrayBuffer): WriteBuffer;
    /**
     * Writes a number as integer value.The best suited encoding format(Uint8 Uint16 or Uint32) is
     * computed automatically and encoded as the first byte. Mainly used to persist length values of
     * strings and arrays.
     */
    writeInteger(value: number): WriteBuffer
    /**
     * Makes any writes to the buffer permanent, for example by sending the writes over a channel.
     * You must obtain a new write buffer after committing
     */
    commit(): void;
}

export class ForwardingWriteBuffer implements WriteBuffer {
    constructor(protected readonly underlying: WriteBuffer) {
    }

    writeUint8(byte: number): WriteBuffer {
        this.underlying.writeUint8(byte);
        return this;
    }

    writeUint16(value: number): WriteBuffer {
        this.underlying.writeUint16(value);
        return this;
    }

    writeUint32(value: number): WriteBuffer {
        this.underlying.writeUint32(value);
        return this;
    }

    writeInteger(value: number): WriteBuffer {
        this.underlying.writeInteger(value);
        return this;
    }

    writeString(value: string): WriteBuffer {
        this.underlying.writeString(value);
        return this;
    }

    writeBytes(value: ArrayBuffer): WriteBuffer {
        this.underlying.writeBytes(value);
        return this;
    }

    commit(): void {
        this.underlying.commit();
    }
}

export enum UintType {
    Uint8 = 1,
    Uint16 = 2,
    Uint32 = 3
}

/**
 * Checks wether the given number is an unsigned integer and returns the {@link UintType}
 * that is needed to store it in binary format.
 * @param value The number for which the UintType should be retrieved.
 * @returns the corresponding UInt type.
 * @throws An error if the given number is not an unsigned integer.
 */
export function getUintType(value: number): UintType {
    if (value < 0 || (value % 1) !== 0) {
        throw new Error(`Could not determine IntType. ${value} is not an unsigned integer`);
    }
    if (value <= 255) {
        return UintType.Uint8;
    } else if (value <= 65535) {
        return UintType.Uint16;
    }
    return UintType.Uint32;
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
    readBytes(): ArrayBuffer;

    /**
     * Reads a number as int value. The encoding format(Uint8, Uint16, or Uint32) is expected to be
     * encoded in the first byte.
     */
    readInteger(): number
    /**
     * Returns a new read buffer whose starting read position is the current read position of this buffer.
     * Can be used to read (sub) messages multiple times.
     */
    sliceAtCurrentPosition(): ReadBuffer
}
