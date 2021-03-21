/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// based on https://github.com/microsoft/vscode/blob/04c36be045a94fee58e5f8992d3e3fd980294a84/src/vs/base/common/buffer.ts

/* eslint-disable no-null/no-null */

import { Buffer as SaferBuffer } from 'safer-buffer';
import * as iconv from 'iconv-lite';
import * as streams from './stream';

const hasBuffer = (typeof Buffer !== 'undefined');
const hasTextEncoder = (typeof TextEncoder !== 'undefined');
const hasTextDecoder = (typeof TextDecoder !== 'undefined');

let textEncoder: TextEncoder | null;
let textDecoder: TextDecoder | null;

export class BinaryBuffer {

    static alloc(byteLength: number): BinaryBuffer {
        if (hasBuffer) {
            return new BinaryBuffer(Buffer.allocUnsafe(byteLength));
        } else {
            return new BinaryBuffer(new Uint8Array(byteLength));
        }
    }

    static wrap(actual: Uint8Array): BinaryBuffer {
        if (hasBuffer && !(Buffer.isBuffer(actual))) {
            // https://nodejs.org/dist/latest-v10.x/docs/api/buffer.html#buffer_class_method_buffer_from_arraybuffer_byteoffset_length
            // Create a zero-copy Buffer wrapper around the ArrayBuffer pointed to by the Uint8Array
            actual = Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength);
        }
        return new BinaryBuffer(actual);
    }

    static fromString(source: string): BinaryBuffer {
        if (hasBuffer) {
            return new BinaryBuffer(Buffer.from(source));
        } else if (hasTextEncoder) {
            if (!textEncoder) {
                textEncoder = new TextEncoder();
            }
            return new BinaryBuffer(textEncoder.encode(source));
        } else {
            return new BinaryBuffer(iconv.encode(source, 'utf8'));
        }
    }

    static concat(buffers: BinaryBuffer[], totalLength?: number): BinaryBuffer {
        if (typeof totalLength === 'undefined') {
            totalLength = 0;
            for (let i = 0, len = buffers.length; i < len; i++) {
                totalLength += buffers[i].byteLength;
            }
        }

        const ret = BinaryBuffer.alloc(totalLength);
        let offset = 0;
        for (let i = 0, len = buffers.length; i < len; i++) {
            const element = buffers[i];
            ret.set(element, offset);
            offset += element.byteLength;
        }

        return ret;
    }

    readonly buffer: Uint8Array;
    readonly byteLength: number;

    private constructor(buffer: Uint8Array) {
        this.buffer = buffer;
        this.byteLength = this.buffer.byteLength;
    }

    toString(): string {
        if (hasBuffer) {
            return this.buffer.toString();
        } else if (hasTextDecoder) {
            if (!textDecoder) {
                textDecoder = new TextDecoder();
            }
            return textDecoder.decode(this.buffer);
        } else {
            return iconv.decode(SaferBuffer.from(this.buffer), 'utf8');
        }
    }

    slice(start?: number, end?: number): BinaryBuffer {
        // IMPORTANT: use subarray instead of slice because TypedArray#slice
        // creates shallow copy and NodeBuffer#slice doesn't. The use of subarray
        // ensures the same, performant, behaviour.
        return new BinaryBuffer(this.buffer.subarray(start, end));
    }

    set(array: BinaryBuffer, offset?: number): void;
    set(array: Uint8Array, offset?: number): void;
    set(array: BinaryBuffer | Uint8Array, offset?: number): void {
        if (array instanceof BinaryBuffer) {
            this.buffer.set(array.buffer, offset);
        } else {
            this.buffer.set(array, offset);
        }
    }

    readUInt32BE(offset: number): number {
        return (
            this.buffer[offset] * 2 ** 24
            + this.buffer[offset + 1] * 2 ** 16
            + this.buffer[offset + 2] * 2 ** 8
            + this.buffer[offset + 3]
        );
    }

    writeUInt32BE(value: number, offset: number): void {
        this.buffer[offset + 3] = value;
        value = value >>> 8;
        this.buffer[offset + 2] = value;
        value = value >>> 8;
        this.buffer[offset + 1] = value;
        value = value >>> 8;
        this.buffer[offset] = value;
    }

    readUInt32LE(offset: number): number {
        return (
            ((this.buffer[offset + 0] << 0) >>> 0) |
            ((this.buffer[offset + 1] << 8) >>> 0) |
            ((this.buffer[offset + 2] << 16) >>> 0) |
            ((this.buffer[offset + 3] << 24) >>> 0)
        );
    }

    writeUInt32LE(value: number, offset: number): void {
        this.buffer[offset + 0] = (value & 0b11111111);
        value = value >>> 8;
        this.buffer[offset + 1] = (value & 0b11111111);
        value = value >>> 8;
        this.buffer[offset + 2] = (value & 0b11111111);
        value = value >>> 8;
        this.buffer[offset + 3] = (value & 0b11111111);
    }

    readUInt8(offset: number): number {
        return this.buffer[offset];
    }

    writeUInt8(value: number, offset: number): void {
        this.buffer[offset] = value;
    }

}

export interface BinaryBufferReadable extends streams.Readable<BinaryBuffer> { }
export namespace BinaryBufferReadable {
    export function toBuffer(readable: BinaryBufferReadable): BinaryBuffer {
        return streams.consumeReadable<BinaryBuffer>(readable, chunks => BinaryBuffer.concat(chunks));
    }
    export function fromBuffer(buffer: BinaryBuffer): BinaryBufferReadable {
        return streams.toReadable<BinaryBuffer>(buffer);
    }
    export function fromReadable(readable: streams.Readable<string>): BinaryBufferReadable {
        return {
            read(): BinaryBuffer | null {
                const value = readable.read();

                if (typeof value === 'string') {
                    return BinaryBuffer.fromString(value);
                }

                return null;
            }
        };
    }
}

export interface BinaryBufferReadableStream extends streams.ReadableStream<BinaryBuffer> { }
export namespace BinaryBufferReadableStream {
    export function toBuffer(stream: BinaryBufferReadableStream): Promise<BinaryBuffer> {
        return streams.consumeStream<BinaryBuffer>(stream, chunks => BinaryBuffer.concat(chunks));
    }
    export function fromBuffer(buffer: BinaryBuffer): BinaryBufferReadableStream {
        return streams.toStream<BinaryBuffer>(buffer, chunks => BinaryBuffer.concat(chunks));
    }
}

export interface BinaryBufferReadableBufferedStream extends streams.ReadableBufferedStream<BinaryBuffer> { }
export namespace BinaryBufferReadableBufferedStream {
    export async function toBuffer(bufferedStream: streams.ReadableBufferedStream<BinaryBuffer>): Promise<BinaryBuffer> {
        if (bufferedStream.ended) {
            return BinaryBuffer.concat(bufferedStream.buffer);
        }

        return BinaryBuffer.concat([

            // Include already read chunks...
            ...bufferedStream.buffer,

            // ...and all additional chunks
            await BinaryBufferReadableStream.toBuffer(bufferedStream.stream)
        ]);
    }
}

export interface BinaryBufferWriteableStream extends streams.WriteableStream<BinaryBuffer> { }
export namespace BinaryBufferWriteableStream {
    export function create(options?: streams.WriteableStreamOptions): BinaryBufferWriteableStream {
        return streams.newWriteableStream<BinaryBuffer>(chunks => BinaryBuffer.concat(chunks), options);
    }
}
