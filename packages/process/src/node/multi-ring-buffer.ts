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

import { Disposable } from '@theia/core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Readable } from 'stream';

/**
 * The MultiRingBuffer is a ring buffer implementation that allows
 * multiple independent readers.
 *
 * These readers are created using the getReader or getStream functions
 * to create a reader that can be read using deq() or one that is a readable stream.
 */
export class MultiRingBufferReadableStream extends Readable implements Disposable {

    protected more = false;
    protected disposed = false;

    constructor(
        protected readonly ringBuffer: MultiRingBuffer,
        protected readonly reader: number,
        encoding = 'utf8'
    ) {
        super({ encoding, /* emitClose: true */ });
    }

    _read(size: number): void {
        this.more = true;
        this.deq(size);
    }

    _destroy(err: Error | null, callback: (err: Error | null) => void): void {
        this.ringBuffer.closeStream(this);
        this.ringBuffer.closeReader(this.reader);
        this.disposed = true;
        this.removeAllListeners();
        callback(err);
    }

    onData(): void {
        if (this.more && !this.disposed) {
            this.deq(-1);
        }
    }

    deq(size: number): void {
        if (this.disposed) {
            return;
        }
        let buffer; do {
            buffer = this.ringBuffer.deq(this.reader, size, this.readableEncoding!);
            if (buffer !== undefined) {
                this.more = this.push(buffer, this.readableEncoding!);
            } else if (this.ringBuffer.closed) {
                // no more data is available and no more data will be pushed
                this.destroy();
                return;
            }
        }
        while (buffer !== undefined && this.more && !this.disposed);
    }

    dispose(): void {
        this.destroy();
    }
}

export const MultiRingBufferOptions = Symbol('MultiRingBufferOptions');
export interface MultiRingBufferOptions {
    readonly size: number,
    readonly encoding?: string,
}

export interface WrappedPosition { newPos: number, wrap: boolean }

@injectable()
export class MultiRingBuffer implements Disposable {

    protected _closed: boolean = false;
    protected readonly buffer: Buffer;
    protected head: number = -1;
    protected tail: number = -1;
    protected readonly maxSize: number;
    protected readonly encoding: string;

    /** <id, position> */
    protected readonly readers = new Map<number, number>();
    /** <stream, id> */
    protected readonly streams = new Map<MultiRingBufferReadableStream, number>();
    protected readerId = 0;

    constructor(
        @inject(MultiRingBufferOptions) protected readonly options: MultiRingBufferOptions
    ) {
        this.maxSize = options.size;
        this.buffer = Buffer.alloc(this.maxSize);
        this.encoding = options.encoding ?? 'utf8';
    }

    get closed(): boolean {
        return this._closed;
    }

    enq(str: string, encoding = 'utf8'): void {
        this.checkClosed();

        let buffer = Buffer.from(str, encoding as BufferEncoding);

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

    getReader(): number {
        this.readers.set(this.readerId, this.tail);
        return this.readerId++;
    }

    closeReader(id: number): void {
        this.readers.delete(id);
    }

    getStream(encoding?: string): MultiRingBufferReadableStream {
        const reader = this.getReader();
        const readableStream = new MultiRingBufferReadableStream(this, reader, encoding);
        this.streams.set(readableStream, reader);
        return readableStream;
    }

    closeStream(readableStream: MultiRingBufferReadableStream): void {
        this.streams.delete(<MultiRingBufferReadableStream>readableStream);
    }

    sizeForReader(id: number): number {
        const pos = this.readers.get(id);
        if (pos === undefined) {
            return 0;
        }

        return this.sizeFrom(pos, this.head, this.isWrapped(pos, this.head));
    }

    size(): number {
        return this.sizeFrom(this.tail, this.head, this.isWrapped(this.tail, this.head));
    }

    emptyForReader(id: number): boolean {
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

    /**
     * Mark the buffer as closed. We won't accept new data, but the streams
     * might keep emitting data as being held by this buffer. The streams will
     * eventually reach the end and destroy themselves.
     */
    dispose(): void {
        this._closed = true;
    }

    protected onData(start: number): void {
        // Any stream that has read everything already
        // should go back to the last buffer in start offset.
        for (const [id, pos] of this.readers.entries()) {
            if (pos === -1) {
                this.readers.set(id, start);
            }
        }
        // Notify the streams there's new data.
        for (const readableStream of this.streams.keys()) {
            readableStream.onData();
        }
    }

    protected isWrapped(from: number, to: number): boolean {
        if (to < from) {
            return true;
        } else {
            return false;
        }
    }
    protected sizeFrom(from: number, to: number, wrap: boolean): number {
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

    /**
     * Position should be incremented if it goes past the end.
     */
    protected shouldIncPos(pos: number, end: number, size: number): boolean {
        const { newPos: newHead, wrap } = this.inc(end, size);

        // Tail Head
        if (this.isWrapped(pos, end) === false) {
            // Head needs to wrap to push the tail
            if (wrap === true && newHead >= pos) {
                return true;
            }
        } else { // Head Tail
            //  If we wrap head is pushing tail, or if it goes over pos
            if (wrap === true || newHead >= pos) {
                return true;
            }
        }
        return false;
    }

    protected incTailSize(pos: number, head: number, size: number): WrappedPosition {
        const { newPos: newHead } = this.inc(head, size);
        // New tail is 1 past newHead.
        return this.inc(newHead, 1);
    }

    protected incTail(pos: number, size: number): WrappedPosition {

        if (this.shouldIncPos(pos, this.head, size) === false) {
            return { newPos: pos, wrap: false };
        }

        return this.incTailSize(pos, this.head, size);
    }

    /**
     * Increment the main tail and all the reader positions.
     */
    protected incTails(size: number): void {
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

    protected checkClosed(): void {
        if (this._closed) {
            throw new Error('this buffer is closed');
        }
    }
}
