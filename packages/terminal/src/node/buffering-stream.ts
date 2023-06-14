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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Emitter, Event } from '@theia/core/lib/common/event';

export interface BufferingStreamOptions {
    /**
     * Max size in bytes of the chunks being emitted.
     */
    maxChunkSize?: number
    /**
     * Amount of time in milliseconds to wait between the moment we start
     * buffering data and when we emit the buffered chunk.
     */
    emitInterval?: number
}

/**
 * This component will buffer whatever is pushed to it and emit chunks back
 * every {@link BufferingStreamOptions.emitInterval}. It will also ensure that
 * the emitted chunks never exceed {@link BufferingStreamOptions.maxChunkSize}.
 */
export class BufferingStream<T> {
    protected buffer?: T;
    protected timeout?: NodeJS.Timeout;
    protected maxChunkSize: number;
    protected emitInterval: number;

    protected onDataEmitter = new Emitter<T>();
    protected readonly concat: (left: T, right: T) => T;
    protected readonly slice: (what: T, start?: number, end?: number) => T;
    protected readonly length: (what: T) => number;

    constructor(options: BufferingStreamOptions = {}, concat: (left: T, right: T) => T, slice: (what: T, start?: number, end?: number) => T, length: (what: T) => number) {
        this.emitInterval = options.emitInterval ?? 16; // ms
        this.maxChunkSize = options.maxChunkSize ?? (256 * 1024); // bytes
        this.concat = concat;
        this.slice = slice;
        this.length = length;
    }

    get onData(): Event<T> {
        return this.onDataEmitter.event;
    }

    push(chunk: T): void {
        if (this.buffer) {
            this.buffer = this.concat(this.buffer, chunk);
        } else {
            this.buffer = chunk;
            this.timeout = setTimeout(() => this.emitBufferedChunk(), this.emitInterval);
        }
    }

    dispose(): void {
        clearTimeout(this.timeout);
        this.buffer = undefined;
        this.onDataEmitter.dispose();
    }

    protected emitBufferedChunk(): void {
        this.onDataEmitter.fire(this.slice(this.buffer!, 0, this.maxChunkSize));
        if (this.length(this.buffer!) <= this.maxChunkSize) {
            this.buffer = undefined;
        } else {
            this.buffer = this.slice(this.buffer!, this.maxChunkSize);
            this.timeout = setTimeout(() => this.emitBufferedChunk(), this.emitInterval);
        }
    }
}

export class StringBufferingStream extends BufferingStream<string> {
    constructor(options: BufferingStreamOptions = {}) {
        super(options, (left, right) => left.concat(right), (what, start, end) => what.slice(start, end), what => what.length);
    }
}

export class BufferBufferingStream extends BufferingStream<Buffer> {
    constructor(options: BufferingStreamOptions = {}) {
        super(options, (left, right) => Buffer.concat([left, right]), (what, start, end) => what.slice(start, end), what => what.length);
    }
}
