// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { AbstractConnection, Connection } from './connection';
import { Multiplexing } from './multiplexer';

export type SomeBuffer = ArrayBuffer | Uint8Array;

export interface Encoder<T> {
    encode(value: T): Uint8Array
}

export interface Decoder<T> {
    decode(buffer: SomeBuffer): T
}

export interface MultiplexerConnectionOptions {
    /**
     * In bytes/second.
     */
    maxTransferRate?: number
    /**
     * In bytes.
     */
    maxChunkSize?: number
    /**
     * In milliseconds.
     */
    timeSplit?: number
}

/**
 * JS object representation of a frame used to transfer chunks.
 *
 * See the buffer representation as a C struct:
 *
 * ```C
 * struct ChunkFrame {
 *     uint8_t last;
 *     uint32_t messageId;
 *     uint8_t[] chunk;
 * }
 * ```
 */
export interface ChunkFrame {
    /**
     * >0 means this is the last chunk from the original message.
     */
    last: number
    /**
     * Identifies the message this chunk belongs to.
     */
    messageId: number
    /**
     * Actual chunk from the original message.
     */
    chunk: Uint8Array
}

/**
 * Handle identified queues and cycle through each when calling {@link next}.
 */
export class RoundRobinQueueSelector<T> {

    protected selector = 0;
    protected keys: number[] = [];
    protected queues = new Map<number, T[]>();

    get size(): number {
        return this.queues.size;
    }

    push(queueId: number, value: T): void {
        let queue = this.queues.get(queueId);
        if (!queue) {
            this.keys.push(queueId);
            this.queues.set(queueId, queue = []);
        }
        queue.push(value);
    }

    delete(queueId: number): void {
        const index = this.keys.indexOf(queueId);
        if (index < 0) {
            throw new Error(`unknown queueId=${queueId}`);
        }
        // Consider the following example:
        //   this.keys = [0, 1, 2, 3, 4, 5]
        //   this.selector = 3
        // We currently have item 3 at index 3 selected.
        // If we delete item 1 at index 1, then index 3 will point to item 4,
        // hence why we need to shift the selector index:
        if (this.selector > index) {
            this.selector--;
        }
        this.keys.splice(index, 1);
        this.queues.delete(queueId);
    }

    current(): [queueId: number, queue: T[]] {
        if (this.queues.size === 0) {
            throw new Error('no queue');
        }
        const queueId = this.keys[this.selector];
        const queue = this.queues.get(queueId)!;
        return [queueId, queue];
    }

    next(): [queueId: number, queue: T[]] {
        if (this.queues.size === 0) {
            throw new Error('no queue');
        }
        const queueId = this.keys[this.selector];
        const queue = this.queues.get(queueId)!;
        this.selector = (this.selector + 1) % this.keys.length;
        return [queueId, queue];
    }
}

export class MultiplexerConnection extends AbstractConnection<Multiplexing.Message> {

    state = Connection.State.OPENED;

    protected idSequence = 0;
    protected timeSplit: number;
    protected maxChunkSize: number;
    protected maxTransferRate: number;
    /**
     * Queue store that can alternate between each.
     */
    protected sendQueues = new RoundRobinQueueSelector<Iterator<Uint8Array>>();
    /**
     * Accumulate chunks for each message.
     */
    protected receiveBuffers = new Map<number, Uint8Array[]>();
    /**
     * Carry over value from the drain task.
     */
    protected sent = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected timeout?: any;

    constructor(
        protected transport: Connection<SomeBuffer>,
        protected encoder: Encoder<Multiplexing.Message>,
        protected decoder: Decoder<Multiplexing.Message>,
        options?: MultiplexerConnectionOptions
    ) {
        super();
        this.timeSplit = options?.timeSplit ?? 10;
        this.maxChunkSize = options?.maxChunkSize ?? (256 * 1024);
        this.maxTransferRate = options?.maxTransferRate ?? (50 * 1024 * 1024); // 50MB/s is large...
        this.transport.onMessage(buffer => this.handleTransportMessage(buffer), undefined, this.disposables);
        this.transport.onClose(() => this.close());
    }

    sendMessage(message: Multiplexing.Message): void {
        const messageId = this.idSequence++;
        const encoded = this.encoder.encode(message);
        const generator = this.generateChunks(messageId, encoded);
        this.sendQueues.push(message.id, generator);
        this.timeout ??= this.scheduleDrain();
    }

    close(): void {
        this.setClosedAndEmit();
        this.dispose();
    }

    protected handleTransportMessage(buffer: SomeBuffer): void {
        const frame = this.parseChunkFrame(buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer);
        let chunks = this.receiveBuffers.get(frame.messageId);
        if (!chunks) {
            this.receiveBuffers.set(frame.messageId, chunks = []);
        }
        chunks.push(frame.chunk);
        if (frame.last) {
            this.receiveBuffers.delete(frame.messageId);
            const encoded = this.mergeBuffers(chunks);
            const message = this.decoder.decode(encoded);
            this.onMessageEmitter.fire(message);
        }
    }

    protected *generateChunks(messageId: number, buffer: Uint8Array): Generator<Uint8Array> {
        for (
            let offset = 0;
            // We need to stop early to avoid sending a chunk with an empty payload:
            offset < buffer.length - 1;
            offset += this.maxChunkSize
        ) {
            yield this.createChunkFrame(messageId, buffer, offset, this.maxChunkSize);
        }
    }

    /**
     * Take a bite out of {@link buffer} and create a binary chunk frame.
     *
     * See {@link ChunkFrame}.
     */
    protected createChunkFrame(messageId: number, buffer: Uint8Array, offset: number, size: number): Uint8Array {
        size = Math.min(buffer.length - offset, size);
        const last = (offset + size) === buffer.length;
        const chunk = buffer.slice(offset, offset + size);
        const frame = new Uint8Array(1 + 4 + size);
        const dv = new DataView(frame.buffer);
        // last = 1 byte
        if (last) {
            dv.setUint8(frame.byteOffset, 1);
        } else {
            dv.setUint8(frame.byteOffset, 0);
        }
        // messageId = 4 bytes
        dv.setUint32(frame.byteOffset + 1, messageId);
        // chunk
        frame.set(chunk, 5);
        return frame;
    }

    protected parseChunkFrame(frame: Uint8Array): ChunkFrame {
        const dv = new DataView(frame.buffer);
        const last = dv.getUint8(frame.byteOffset);
        const messageId = dv.getUint32(frame.byteOffset + 1);
        const chunk = frame.slice(5);
        return { last, messageId, chunk };
    }

    protected mergeBuffers(buffers: Uint8Array[]): Uint8Array {
        let length = 0;
        buffers.forEach(buffer => {
            length += buffer.length;
        });
        let offset = 0;
        const merged = new Uint8Array(length);
        buffers.forEach(buffer => {
            merged.set(buffer, offset);
            offset += buffer.length;
        });
        return merged;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected scheduleDrain(): any {
        return setTimeout(() => this.drain(this.timeSplit / 1000), this.timeSplit);
    }

    /**
     * Drain chunks by alternating channels round-robin style.
     *
     * Stop draining and continue later once {@link maxTransferRate} has been reached.
     *
     * @param delta Time frame allocated to the drain task in milliseconds.
     */
    protected drain(delta: number): void {
        const limit = this.maxTransferRate * delta;
        this.timeout = undefined;
        while (this.sendQueues.size > 0) {
            const [queueId, generators] = this.sendQueues.next();
            const generator = generators[0];
            const next = generator.next();
            if (!next.done) {
                this.transport.sendMessage(next.value);
                this.sent += next.value.length;
                if (this.sent >= limit) {
                    this.sent %= limit;
                    this.timeout = this.scheduleDrain();
                    return;
                }
            } else if (generators.length === 1) {
                this.sendQueues.delete(queueId);
            } else {
                generators.shift();
            }
        }
    }

    override dispose(): void {
        super.dispose();
        clearTimeout(this.timeout);
    }
}
