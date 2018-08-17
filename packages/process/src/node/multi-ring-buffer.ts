/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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

import * as stream from 'stream';
import { inject, injectable } from 'inversify';
import { Disposable } from '@theia/core/lib/common';

/**
 * The MultiRingBuffer is a ring buffer implementation that allows
 * multiple independant readers.
 *
 * These readers are created using the getReader or getStream functions
 * to create a reader that can be read using deq() or one that is a readable stream.
 */

export class MultiRingBufferReadableStream extends stream.Readable implements Disposable {

    protected more = false;
    protected disposed = false;

    constructor(protected readonly ringBuffer: MultiRingBuffer,
        protected readonly reader: number,
        protected readonly encoding = 'utf8'
    ) {
        super();
        this.setEncoding(encoding);
    }

    _read(size: number) {
        this.more = true;
        this.deq(size);
    }

    onData() {
        if (this.more === true) {
            this.deq(-1);
        }
    }

    deq(size: number) {
        if (this.disposed === true) {
            return;
        }

        let buffer = undefined;
        do {
            buffer = this.ringBuffer.deq(this.reader, size, this.encoding);
            if (buffer !== undefined) {
                this.more = this.push(buffer, this.encoding);
            }
        }
        while (buffer !== undefined && this.more === true && this.disposed === false);
    }

    dispose() {
        this.ringBuffer.closeStream(this);
        this.ringBuffer.closeReader(this.reader);
        this.disposed = true;
        this.removeAllListeners();
    }
}

export const MultiRingBufferOptions = Symbol('MultiRingBufferOptions');
export interface MultiRingBufferOptions {
    readonly size: number,
    readonly encoding?: string,
}

export interface WrappedPosition { newPos: number, wrap: boolean }

@injectable()
export class MultiRingBuffer {

    protected readonly buffer: Buffer;
    protected head: number = -1;
    protected tail: number = -1;
    protected readonly maxSize: number;
    protected readonly encoding: string;

    /* <id, position> */
    protected readonly readers: Map<number, number>;
    /* <stream : id> */
    protected readonly streams: Map<MultiRingBufferReadableStream, number>;
    protected readerId = 0;

    constructor(
        @inject(MultiRingBufferOptions) protected readonly options: MultiRingBufferOptions
    ) {
        this.maxSize = options.size;
        if (options.encoding !== undefined) {
            this.encoding = options.encoding;
        } else {
            this.encoding = 'utf8';
        }
        this.buffer = Buffer.alloc(this.maxSize);
        this.readers = new Map();
        this.streams = new Map();
    }

    enq(astring: string, encoding = 'utf8'): void {
        let buffer: Buffer = Buffer.from(astring, encoding);

        // Take the last elements of string if it's too big, drop the rest
        if (buffer.length > this.maxSize) {
            buffer = buffer.slice(buffer.length - this.maxSize);
        }

        if (buffer.length === 0) {
            return;
        }

        // empty
        if (this.head === -1 && this.tail === -1) {
            this.head = 0;
            this.tail = 0;
            buffer.copy(this.buffer, this.head, 0, buffer.length);
            this.head = buffer.length - 1;
            this.onData(0);
            return;
        }

        const startHead = this.inc(this.head, 1).newPos;

        if (this.inc(startHead, buffer.length).wrap === true) {
            buffer.copy(this.buffer, startHead, 0, this.maxSize - startHead);
            buffer.copy(this.buffer, 0, this.maxSize - startHead);
        } else {
            buffer.copy(this.buffer, startHead);
        }

        this.incTails(buffer.length);
        this.head = this.inc(this.head, buffer.length).newPos;
        this.onData(startHead);
    }

    getReader() {
        this.readers.set(this.readerId, this.tail);
        return this.readerId++;
    }

    closeReader(id: number) {
        this.readers.delete(id);
    }

    getStream(encoding?: string): MultiRingBufferReadableStream {
        const reader = this.getReader();
        const astream = new MultiRingBufferReadableStream(this, reader, encoding);
        this.streams.set(astream, reader);
        return astream;
    }

    closeStream(astream: MultiRingBufferReadableStream) {
        this.streams.delete(<MultiRingBufferReadableStream>astream);
    }

    protected onData(start: number) {
        /*  Any stream that has read everything already
         *  Should go back to the last buffer in start offset */
        for (const [id, pos] of this.readers) {
            if (pos === -1) {
                this.readers.set(id, start);
            }
        }
        /* Notify the streams there's new data. */
        for (const [astream] of this.streams) {
            astream.onData();
        }
    }

    deq(id: number, size = -1, encoding = 'utf8'): string | undefined {
        const pos = this.readers.get(id);
        if (pos === undefined || pos === -1) {
            return undefined;
        }

        if (size === 0) {
            return undefined;
        }

        let buffer = '';
        const maxDeqSize = this.sizeForReader(id);
        const wrapped = this.isWrapped(pos, this.head);

        let deqSize;
        if (size === -1) {
            deqSize = maxDeqSize;
        } else {
            deqSize = Math.min(size, maxDeqSize);
        }

        if (wrapped === false) { // no wrap
            buffer = this.buffer.toString(encoding, pos, pos + deqSize);
        } else { // wrap
            buffer = buffer.concat(this.buffer.toString(encoding, pos, this.maxSize),
                this.buffer.toString(encoding, 0, deqSize - (this.maxSize - pos)));
        }

        const lastIndex = this.inc(pos, deqSize - 1).newPos;
        // everything is read
        if (lastIndex === this.head) {
            this.readers.set(id, -1);
        } else {
            this.readers.set(id, this.inc(pos, deqSize).newPos);
        }

        return buffer;
    }

    sizeForReader(id: number) {
        const pos = this.readers.get(id);
        if (pos === undefined) {
            return 0;
        }

        return this.sizeFrom(pos, this.head, this.isWrapped(pos, this.head));
    }

    size() {
        return this.sizeFrom(this.tail, this.head, this.isWrapped(this.tail, this.head));
    }

    protected isWrapped(from: number, to: number) {
        if (to < from) {
            return true;
        } else {
            return false;
        }
    }
    protected sizeFrom(from: number, to: number, wrap: boolean) {
        if (from === -1 || to === -1) {
            return 0;
        } else {
            if (wrap === false) {
                return to - from + 1;
            } else {
                return to + 1 + this.maxSize - from;
            }
        }
    }

    emptyForReader(id: number) {
        const pos = this.readers.get(id);
        if (pos === undefined || pos === -1) {
            return true;
        } else {
            return false;
        }
    }

    empty(): boolean {
        if (this.head === -1 && this.tail === -1) {
            return true;
        } else {
            return false;
        }
    }

    streamsSize(): number {
        return this.streams.size;
    }

    readersSize(): number {
        return this.readers.size;
    }

    /* Position should be incremented if it goes pass end.  */
    protected shouldIncPos(pos: number, end: number, size: number) {
        const { newPos: newHead, wrap } = this.inc(end, size);

        /* Tail Head */
        if (this.isWrapped(pos, end) === false) {
            // Head needs to wrap to push the tail
            if (wrap === true && newHead >= pos) {
                return true;
            }
        } else { /* Head Tail */
            //  If we wrap head is pushing tail, or if it goes over pos
            if (wrap === true || newHead >= pos) {
                return true;
            }
        }
        return false;
    }

    protected incTailSize(pos: number, head: number, size: number): WrappedPosition {
        const { newPos: newHead } = this.inc(head, size);
        /* New tail is 1 past newHead.  */
        return this.inc(newHead, 1);
    }

    protected incTail(pos: number, size: number): WrappedPosition {

        if (this.shouldIncPos(pos, this.head, size) === false) {
            return { newPos: pos, wrap: false };
        }

        return this.incTailSize(pos, this.head, size);
    }

    /* Increment the main tail and all the reader positions. */
    protected incTails(size: number) {
        this.tail = this.incTail(this.tail, size).newPos;

        for (const [id, pos] of this.readers) {
            if (pos !== -1) {
                if (this.shouldIncPos(pos, this.tail, size) === true) {
                    this.readers.set(id, this.tail);
                }
            }
        }
    }

    protected inc(pos: number, size: number): WrappedPosition {
        if (size === 0) {
            return { newPos: pos, wrap: false };
        }
        const newPos = (pos + size) % this.maxSize;
        const wrap = newPos <= pos;
        return { newPos, wrap };
    }
}
